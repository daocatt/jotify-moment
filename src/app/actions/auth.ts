"use server";

import { db } from "@/db";
import { users, verificationCodes, settings, accounts } from "@/db/schema";
import { eq, and, gt, lt } from "drizzle-orm";
import { hashPassword, verifyPassword, generateToken, setSessionCookie, clearSessionCookie, getSessionUser } from "@/lib/auth";
import { hashPassword as hashPasswordBetter } from "better-auth/crypto";
import { sendVerificationCode, sendWelcomeEmail, sendResetPasswordLink } from "@/lib/mail";
import crypto from "crypto";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const CODE_RATE_LIMITS = new Map<string, number>();
const CODE_RATE_WINDOW = 60_000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const lastSent = CODE_RATE_LIMITS.get(key);
  if (lastSent && now - lastSent < CODE_RATE_WINDOW) {
    return false;
  }
  CODE_RATE_LIMITS.set(key, now);
  return true;
}

const LOGIN_RATE_LIMITS = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW = 15 * 60_000;

function checkLoginRateLimit(email: string): boolean {
  const now = Date.now();
  const entry = LOGIN_RATE_LIMITS.get(email);
  if (!entry || now > entry.resetAt) {
    LOGIN_RATE_LIMITS.set(email, { count: 1, resetAt: now + LOGIN_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_LOGIN_ATTEMPTS;
}

async function verifyHcaptcha(token: string): Promise<boolean> {
  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) return true;
  try {
    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export async function isHcaptchaEnabledAction() {
  return { enabled: !!process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY };
}

export async function sendVerificationCodeAction(email: string, type: "register" | "forgot_password", hcaptchaToken?: string) {
  if (!email) return { error: "Email is required" };

  const hcaptchaSiteKey = process.env.HCAPTCHA_SECRET;
  if (hcaptchaSiteKey) {
    if (!hcaptchaToken) return { error: "请完成人机验证" };
    const valid = await verifyHcaptcha(hcaptchaToken);
    if (!valid) return { error: "人机验证失败，请重试" };
  }

  const rateLimitKey = `${email}:${type}`;
  if (!checkRateLimit(rateLimitKey)) {
    return { error: "请稍后再试，验证码发送过于频繁" };
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    await db.delete(verificationCodes).where(
      and(eq(verificationCodes.email, email), eq(verificationCodes.type, type))
    );

    await db.insert(verificationCodes).values({
      email,
      code,
      type,
      expiresAt,
    });

    const result = await sendVerificationCode(email, code);
    if (!result.sent) {
      return { error: "Failed to send verification email. Please check server logs." };
    }

    return { success: true, emailConfigured: result.emailConfigured };
  } catch (error) {
    console.error("sendVerificationCodeAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function registerAction(data: {
  email: string;
  name: string;
  code: string;
  password?: string;
  hcaptchaToken?: string;
}) {
  const { email, name, code, password, hcaptchaToken } = data;

  if (!email || !name || !code || !password) {
    return { error: "All fields are required" };
  }

  const hcaptchaSecret = process.env.HCAPTCHA_SECRET;
  if (hcaptchaSecret) {
    if (!hcaptchaToken) return { error: "请完成人机验证" };
    const valid = await verifyHcaptcha(hcaptchaToken);
    if (!valid) return { error: "人机验证失败，请重试" };
  }

  const trimmedName = name.trim();
  if (trimmedName.length < 2) {
    return { error: "用户名至少需要 2 个字符" };
  }

  try {
    const validCode = await db.query.verificationCodes.findFirst({
      where: and(
        eq(verificationCodes.email, email),
        eq(verificationCodes.code, code),
        eq(verificationCodes.type, "register"),
        gt(verificationCodes.expiresAt, new Date())
      ),
    });

    if (!validCode) {
      return { error: "Invalid or expired verification code" };
    }

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      return { error: "Email already registered" };
    }

    const existingName = await db.query.users.findFirst({
      where: eq(users.name, trimmedName),
    });
    if (existingName) {
      return { error: "该用户名已被使用" };
    }

    const isFirstUser = (await db.query.users.findFirst({ columns: { id: true } })) === undefined;

    if (!isFirstUser) {
      const allowReg = await db.query.settings.findFirst({
        where: eq(settings.key, "allow_registration"),
      });
      if (allowReg && allowReg.value !== "true") {
        return { error: "Registration is currently disabled by administrator" };
      }
    }

    const { headers } = await import("next/headers");
    const { auth } = await import("@/lib/auth-better");

    const signUpResult = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
      headers: await headers(),
    });

    if (!signUpResult || !signUpResult.user) {
      return { error: "注册失败，请重试" };
    }

    const userRole = isFirstUser ? "super_admin" : "guest";

    try {
      await db.update(users).set({
        role: userRole,
        emailVerified: true,
      }).where(eq(users.id, signUpResult.user.id));
    } catch {
      console.error("registerAction: failed to update role for user", signUpResult.user.id);
    }

    let slugCandidate: string | null = null;
    if (userRole !== "guest") {
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = Math.floor(10000000 + Math.random() * 90000000).toString();
        const conflict = await db.query.users.findFirst({ where: eq(users.slug, candidate) });
        if (!conflict || conflict.id === signUpResult.user.id) {
          slugCandidate = candidate;
          break;
        }
      }
      if (slugCandidate) {
        try {
          await db.update(users).set({ slug: slugCandidate }).where(eq(users.id, signUpResult.user.id));
        } catch {
          console.error("registerAction: failed to set slug for user", signUpResult.user.id);
        }
      }
    }

    try {
      await db.delete(verificationCodes).where(eq(verificationCodes.id, validCode.id));
    } catch {
      console.error("registerAction: failed to delete verification code");
    }

    sendWelcomeEmail(email, name).catch((err) => {
      console.error("Failed to send welcome email:", err);
    });

    return {
      success: true,
      user: {
        id: signUpResult.user.id,
        email: signUpResult.user.email,
        name: signUpResult.user.name,
        role: userRole,
        slug: slugCandidate,
      }
    };
  } catch (error: any) {
    console.error("registerAction error:", error);
    return { error: "注册失败，请重试" };
  }
}

export async function loginAction(data: { email: string; password?: string; hcaptchaToken?: string }) {
  const { email, password, hcaptchaToken } = data;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const hcaptchaSecret = process.env.HCAPTCHA_SECRET;
  if (hcaptchaSecret) {
    if (!hcaptchaToken) return { error: "请完成人机验证" };
    const valid = await verifyHcaptcha(hcaptchaToken);
    if (!valid) return { error: "人机验证失败，请重试" };
  }

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return { error: "Invalid email or password" };
    }

    if (user.loginDisabledAt) {
      return { error: "该账号因密码错误次数过多已被禁用登录，请联系管理员解锁" };
    }

    if (user.status === "suspended") {
      return { error: "Your account has been suspended" };
    }

    const { headers } = await import("next/headers");
    const { auth } = await import("@/lib/auth-better");

    const signInResult = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
      headers: await headers(),
    });

    if (!signInResult || !signInResult.user || !signInResult.token) {
      if (!checkLoginRateLimit(email)) {
        await db.update(users).set({ loginDisabledAt: new Date() }).where(eq(users.email, email));
        LOGIN_RATE_LIMITS.delete(email);
        return { error: "密码错误次数过多，账号已被禁用登录，请联系管理员解锁" };
      }
      return { error: "Invalid email or password" };
    }

    LOGIN_RATE_LIMITS.delete(email);

    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    cookieStore.set("better-auth.session_token", signInResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      path: "/",
    });

    return {
      success: true,
      user: {
        id: signInResult.user.id,
        email: signInResult.user.email,
        name: signInResult.user.name,
        role: user.role,
      }
    };
  } catch (error: any) {
    console.error("loginAction error:", error);
    return { error: "邮箱或密码错误" };
  }
}

export async function logoutAction() {
  try {
    const { headers } = await import("next/headers");
    const { auth } = await import("@/lib/auth-better");

    await auth.api.signOut({
      headers: await headers(),
    });

    await clearSessionCookie();

    return { success: true };
  } catch (error) {
    console.error("logoutAction error:", error);
    return { error: "Failed to logout" };
  }
}

export async function resetPasswordAction(data: {
  token: string;
  password?: string;
}) {
  const { token, password } = data;

  if (!token || !password) {
    return { error: "所有字段都是必填的" };
  }

  try {
    const tokenHash = hashToken(token);

    const validCode = await db.query.verificationCodes.findFirst({
      where: and(
        eq(verificationCodes.code, tokenHash),
        eq(verificationCodes.type, "reset_password"),
        gt(verificationCodes.expiresAt, new Date())
      ),
    });

    if (!validCode) {
      return { error: "重置链接无效或已过期，请重新申请" };
    }

    const email = validCode.email;

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return { error: "用户不存在" };
    }

    const passwordHash = await hashPasswordBetter(password);
    await db.update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")));

    await db.delete(verificationCodes).where(eq(verificationCodes.id, validCode.id));

    await db.delete(verificationCodes).where(
      and(eq(verificationCodes.email, email), lt(verificationCodes.expiresAt, new Date()))
    );

    if (user.loginDisabledAt) {
      await db.update(users).set({ loginDisabledAt: null }).where(eq(users.id, user.id));
    }

    return { success: true };
  } catch (error) {
    console.error("resetPasswordAction error:", error);
    return { error: "Internal server error" };
  }
}

const MAX_RESET_PASSWORD_SENDS = 5;
const RESET_PASSWORD_24H = 24 * 60 * 60 * 1000;

const RESET_PASSWORD_SEND_LIMITS = new Map<string, { count: number; resetAt: number }>();

function checkResetPasswordSendLimit(email: string): { allowed: boolean; count: number } {
  const now = Date.now();
  const entry = RESET_PASSWORD_SEND_LIMITS.get(email);
  if (!entry || now > entry.resetAt) {
    RESET_PASSWORD_SEND_LIMITS.set(email, { count: 1, resetAt: now + RESET_PASSWORD_24H });
    return { allowed: true, count: 1 };
  }
  if (entry.count >= MAX_RESET_PASSWORD_SENDS) {
    return { allowed: false, count: entry.count };
  }
  entry.count++;
  return { allowed: true, count: entry.count };
}

export async function sendResetPasswordLinkAction(email: string, origin: string, hcaptchaToken?: string) {
  if (!email) return { error: "邮箱不能为空" };

  const hcaptchaSecret = process.env.HCAPTCHA_SECRET;
  if (hcaptchaSecret) {
    if (!hcaptchaToken) return { error: "请完成人机验证" };
    const valid = await verifyHcaptcha(hcaptchaToken);
    if (!valid) return { error: "人机验证失败，请重试" };
  }

  const rateLimitKey = `${email}:reset_password`;
  if (!checkRateLimit(rateLimitKey)) {
    return { error: "请稍后再试，重置邮件发送过于频繁" };
  }

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return { error: "该邮箱未注册账户" };
    }

    const existingToken = await db.query.verificationCodes.findFirst({
      where: and(
        eq(verificationCodes.email, email),
        eq(verificationCodes.type, "reset_password"),
        gt(verificationCodes.expiresAt, new Date())
      ),
    });

    if (existingToken) {
      const sendCheck = checkResetPasswordSendLimit(email);
      if (!sendCheck.allowed) {
        return { error: "重置密码邮件发送次数已达上限（5次），请24小时后再试" };
      }

      const newToken = crypto.randomBytes(32).toString("hex");
      const newTokenHash = hashToken(newToken);
      const newExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

      await db.delete(verificationCodes).where(eq(verificationCodes.id, existingToken.id));

      await db.insert(verificationCodes).values({
        email,
        code: newTokenHash,
        type: "reset_password",
        expiresAt: newExpiresAt,
        sentCount: String(sendCheck.count),
      });

      const result = await sendResetPasswordLink(email, newToken, origin);
      if (!result.sent) {
        return { error: "发送重置密码邮件失败，请检查邮件配置" };
      }

      return { success: true };
    }

    const sendCheck = checkResetPasswordSendLimit(email);
    if (!sendCheck.allowed) {
      return { error: "重置密码邮件发送次数已达上限（5次），请24小时后再试" };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await db.insert(verificationCodes).values({
      email,
      code: tokenHash,
      type: "reset_password",
      expiresAt,
      sentCount: String(sendCheck.count),
    });

    const result = await sendResetPasswordLink(email, token, origin);
    if (!result.sent) {
      return { error: "发送重置密码邮件失败，请检查邮件配置" };
    }

    return { success: true };
  } catch (error) {
    console.error("sendResetPasswordLinkAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function verifyResetTokenAction(token: string) {
  if (!token) return { valid: false };

  try {
    const tokenHash = hashToken(token);
    const validCode = await db.query.verificationCodes.findFirst({
      where: and(
        eq(verificationCodes.code, tokenHash),
        eq(verificationCodes.type, "reset_password"),
        gt(verificationCodes.expiresAt, new Date())
      ),
      columns: { id: true, email: true },
    });

    if (!validCode) return { valid: false };
    return { valid: true, email: validCode.email };
  } catch {
    return { valid: false };
  }
}

export async function guestSendResetPasswordAction(origin: string) {
  const user = await getSessionUser();
  if (!user) return { error: "请先登录" };
  if (user.role !== "guest") return { error: "仅访客用户可使用此功能" };

  const email = user.email;
  const rateLimitKey = `${email}:reset_password`;
  if (!checkRateLimit(rateLimitKey)) {
    return { error: "请稍后再试，重置邮件发送过于频繁" };
  }

  try {
    const existingToken = await db.query.verificationCodes.findFirst({
      where: and(
        eq(verificationCodes.email, email),
        eq(verificationCodes.type, "reset_password"),
        gt(verificationCodes.expiresAt, new Date())
      ),
    });

    if (existingToken) {
      const sendCheck = checkResetPasswordSendLimit(email);
      if (!sendCheck.allowed) {
        return { error: "重置密码邮件发送次数已达上限（5次），请24小时后再试" };
      }

      const newToken = crypto.randomBytes(32).toString("hex");
      const newTokenHash = hashToken(newToken);
      const newExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

      await db.delete(verificationCodes).where(eq(verificationCodes.id, existingToken.id));

      await db.insert(verificationCodes).values({
        email,
        code: newTokenHash,
        type: "reset_password",
        expiresAt: newExpiresAt,
        sentCount: String(sendCheck.count),
      });

      const result = await sendResetPasswordLink(email, newToken, origin);
      if (!result.sent) {
        return { error: "发送重置密码邮件失败，请检查邮件配置" };
      }

      return { success: true };
    }

    const sendCheck = checkResetPasswordSendLimit(email);
    if (!sendCheck.allowed) {
      return { error: "重置密码邮件发送次数已达上限（5次），请24小时后再试" };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await db.insert(verificationCodes).values({
      email,
      code: tokenHash,
      type: "reset_password",
      expiresAt,
      sentCount: String(sendCheck.count),
    });

    const result = await sendResetPasswordLink(email, token, origin);
    if (!result.sent) {
      return { error: "发送重置密码邮件失败，请检查邮件配置" };
    }

    return { success: true };
  } catch (error) {
    console.error("guestSendResetPasswordAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function generateSSOTokenAction(callbackUrl?: string) {
  try {
    const user = await getSessionUser();
    if (!user) return { error: "Unauthorized" };

    if (callbackUrl) {
      let callbackHost: string;
      try {
        callbackHost = new URL(callbackUrl).hostname.toLowerCase();
      } catch {
        return { error: "Invalid callback URL" };
      }

      const mainHostEnv = process.env.MAIN_HOST || "";
      const mainHosts = mainHostEnv.split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
      if (mainHosts.includes(callbackHost)) {
        return { error: "Callback cannot be a main host domain" };
      }

      const domainUser = await db.query.users.findFirst({
        where: and(
          eq(users.customDomain, callbackHost),
          eq(users.allowCustomDomain, true),
        ),
        columns: { id: true },
      });
      if (!domainUser) {
        return { error: "Callback domain is not a registered custom domain" };
      }
    }

    const secret = process.env.BETTER_AUTH_SECRET || "sso-secret";
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const payload = `${user.id}:${expiresAt}`;
    const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const token = Buffer.from(`${payload}:${hmac}`).toString("base64");

    return { success: true, token };
  } catch (error) {
    console.error("generateSSOTokenAction error:", error);
    return { error: "Internal server error" };
  }
}

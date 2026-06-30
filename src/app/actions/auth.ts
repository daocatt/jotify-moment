"use server";

import { db } from "@/db";
import { users, verificationCodes, settings, accounts } from "@/db/schema";
import { eq, and, gt, lt } from "drizzle-orm";
import { hashPassword, verifyPassword, generateToken, setSessionCookie, clearSessionCookie } from "@/lib/auth";
import { hashPassword as hashPasswordBetter } from "better-auth/crypto";
import { sendVerificationCode, sendWelcomeEmail, sendResetPasswordLink } from "@/lib/mail";
import crypto from "crypto";

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
const MAX_LOGIN_ATTEMPTS = 5;
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

export async function sendVerificationCodeAction(email: string, type: "register" | "forgot_password") {
  if (!email) return { error: "Email is required" };

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
  role?: "user" | "guest";
}) {
  const { email, name, code, password, role } = data;

  if (!email || !name || !code || !password) {
    return { error: "All fields are required" };
  }

  try {
    // 1. Verify code
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

    // 2. Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      return { error: "Email already registered" };
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

    // 3. Register user via Better Auth
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
      headers: await headers(),
    });

    if (!signUpResult || !signUpResult.user) {
      return { error: "Failed to sign up user" };
    }

    const userRole = isFirstUser ? "super_admin" : (role === "user" ? "user" : "guest");

    // 4. Update additional compatibility fields in the database
    await db.update(users).set({
      role: userRole,
      emailVerified: true,
    }).where(eq(users.id, signUpResult.user.id));

    let slugCandidate: string | null = null;
    if (userRole !== "guest") {
      // 5. Set default homepage slug = unique 8-digit number
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = Math.floor(10000000 + Math.random() * 90000000).toString();
        const conflict = await db.query.users.findFirst({ where: eq(users.slug, candidate) });
        if (!conflict || conflict.id === signUpResult.user.id) {
          slugCandidate = candidate;
          break;
        }
      }
      if (slugCandidate) {
        await db.update(users).set({ slug: slugCandidate }).where(eq(users.id, signUpResult.user.id));
      }
    }

    // 6. Delete used code
    await db.delete(verificationCodes).where(eq(verificationCodes.id, validCode.id));

    // 7. Send welcome email (non-blocking)
    sendWelcomeEmail(email, name).catch((err) => {
      console.error("Failed to send welcome email:", err);
    });

    return {
      success: true,
      user: {
        id: signUpResult.user.id,
        email: signUpResult.user.email,
        name: signUpResult.user.name,
        role,
        slug: slugCandidate,
      }
    };
  } catch (error: any) {
    console.error("registerAction error:", error);
    return { error: error.message || "Internal server error" };
  }
}

export async function loginAction(data: { email: string; password?: string }) {
  const { email, password } = data;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  if (!checkLoginRateLimit(email)) {
    return { error: "登录尝试过于频繁，请15分钟后再试" };
  }

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return { error: "Invalid email or password" };
    }

    if (user.status === "suspended") {
      return { error: "Your account has been suspended" };
    }

    const { headers } = await import("next/headers");
    const { auth } = await import("@/lib/auth-better");

    // Authenticate via Better Auth
    const signInResult = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
      headers: await headers(),
    });

    if (!signInResult || !signInResult.user || !signInResult.token) {
      return { error: "Invalid email or password" };
    }

    LOGIN_RATE_LIMITS.delete(email);

    // Set Better Auth session cookie manually in Next.js Server Action
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    cookieStore.set("better-auth.session_token", signInResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days expiration
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
    return { error: error.message || "Invalid email or password" };
  }
}

export async function logoutAction() {
  try {
    const { headers } = await import("next/headers");
    const { auth } = await import("@/lib/auth-better");

    await auth.api.signOut({
      headers: await headers(),
    });

    // Clear session cookie manually
    await clearSessionCookie();

    return { success: true };
  } catch (error) {
    console.error("logoutAction error:", error);
    return { error: "Failed to logout" };
  }
}

export async function resetPasswordAction(data: {
  email: string;
  token: string;
  password?: string;
}) {
  const { email, token, password } = data;

  if (!email || !token || !password) {
    return { error: "所有字段都是必填的" };
  }

  try {
    // Verify token
    const validCode = await db.query.verificationCodes.findFirst({
      where: and(
        eq(verificationCodes.email, email),
        eq(verificationCodes.code, token),
        eq(verificationCodes.type, "reset_password"),
        gt(verificationCodes.expiresAt, new Date())
      ),
    });

    if (!validCode) {
      return { error: "重置链接无效或已过期，请重新申请" };
    }

    // Get user
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return { error: "用户不存在" };
    }

    // Update password in Better Auth accounts table
    const passwordHash = await hashPasswordBetter(password);
    await db.update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")));

    await db.delete(verificationCodes).where(eq(verificationCodes.id, validCode.id));

    await db.delete(verificationCodes).where(
      and(eq(verificationCodes.email, email), lt(verificationCodes.expiresAt, new Date()))
    );

    return { success: true };
  } catch (error) {
    console.error("resetPasswordAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function sendResetPasswordLinkAction(email: string, origin: string) {
  if (!email) return { error: "邮箱不能为空" };

  const rateLimitKey = `${email}:reset_password`;
  if (!checkRateLimit(rateLimitKey)) {
    return { error: "请稍后再试，重置邮件发送过于频繁" };
  }

  try {
    // Check if user exists
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return { error: "该邮箱未注册账户" };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

    await db.delete(verificationCodes).where(
      and(eq(verificationCodes.email, email), eq(verificationCodes.type, "reset_password"))
    );

    await db.insert(verificationCodes).values({
      email,
      code: token,
      type: "reset_password",
      expiresAt,
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

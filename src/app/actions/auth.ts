"use server";

import { db } from "@/db";
import { users, verificationCodes, settings } from "@/db/schema";
import { eq, and, gt, lt } from "drizzle-orm";
import { hashPassword, verifyPassword, generateToken, setSessionCookie, clearSessionCookie } from "@/lib/auth";
import { sendVerificationCode } from "@/lib/mail";

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

    const sent = await sendVerificationCode(email, code);
    if (!sent) {
      return { error: "Failed to send verification email. Please check server logs." };
    }

    return { success: true };
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
}) {
  const { email, name, code, password } = data;

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

    const passwordHash = await hashPassword(password);
    const role = isFirstUser ? "super_admin" : "user";

    const [newUser] = await db.insert(users).values({
      email,
      name,
      passwordHash,
      role,
      status: "active",
    }).returning();

    // 6. Delete used code
    await db.delete(verificationCodes).where(eq(verificationCodes.id, validCode.id));

    // 7. Auto login
    const token = await generateToken({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      status: newUser.status,
    });
    await setSessionCookie(token);

    return { success: true, user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role } };
  } catch (error) {
    console.error("registerAction error:", error);
    return { error: "Internal server error" };
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

    const matches = await verifyPassword(password, user.passwordHash);
    if (!matches) {
      return { error: "Invalid email or password" };
    }

    LOGIN_RATE_LIMITS.delete(email);

    const token = await generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
    });
    await setSessionCookie(token);

    return { success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  } catch (error) {
    console.error("loginAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function logoutAction() {
  await clearSessionCookie();
  return { success: true };
}

export async function resetPasswordAction(data: {
  email: string;
  code: string;
  password?: string;
}) {
  const { email, code, password } = data;

  if (!email || !code || !password) {
    return { error: "All fields are required" };
  }

  try {
    // Verify code
    const validCode = await db.query.verificationCodes.findFirst({
      where: and(
        eq(verificationCodes.email, email),
        eq(verificationCodes.code, code),
        eq(verificationCodes.type, "forgot_password"),
        gt(verificationCodes.expiresAt, new Date())
      ),
    });

    if (!validCode) {
      return { error: "Invalid or expired verification code" };
    }

    // Get user
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return { error: "User not found" };
    }

    // Update password
    const passwordHash = await hashPassword(password);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

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

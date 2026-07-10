"use server";

import { db } from "@/db";
import { users, accounts, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function hasAdminAction() {
  try {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "super_admin"),
    });
    return { hasAdmin: !!adminUser };
  } catch (error) {
    console.error("hasAdminAction error:", error);
    return { hasAdmin: false, error: "Database connection failed" };
  }
}

export async function initializeSystemAction(data: {
  name: string;
  email: string;
  password?: string;
}) {
  const { name, email, password } = data;

  if (!name || !email || !password) {
    return { error: "所有字段均为必填项" };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { error: "邮箱格式不正确" };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `密码长度至少为 ${MIN_PASSWORD_LENGTH} 位` };
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Guard: Check if super_admin already exists (inside transaction to prevent race condition)
      const existingAdmin = await tx.query.users.findFirst({
        where: eq(users.role, "super_admin"),
      });

      if (existingAdmin) {
        throw new Error("系统已经初始化，不可重复创建超级管理员");
      }

      const userId = crypto.randomUUID();
      const passwordHash = await hashPassword(password);

      // 1. Physically insert user into users table
      await tx.insert(users).values({
        id: userId,
        email: email,
        name: name,
        slug: name,
        role: "super_admin",
        status: "active",
        emailVerified: true,
        bio: null,
        coverImage: null,
      });

      // 2. Physically insert credentials into accounts table for Better Auth Email provider compatibility
      await tx.insert(accounts).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId: userId,
        password: passwordHash,
      });

      const sessionToken = crypto.randomUUID().replace(/-/g, "");
      const sessionExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      // 3. Directly create a session record in the database sessions table
      await tx.insert(sessions).values({
        id: crypto.randomUUID(),
        userId: userId,
        token: sessionToken,
        expiresAt: sessionExpiresAt,
      });

      return { userId, sessionToken, sessionExpiresAt };
    });

    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    cookieStore.set("better-auth.session_token", result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: result.sessionExpiresAt,
      path: "/",
    });

    return { success: true };
  } catch (error: unknown) {
    console.error("initializeSystemAction database error:", error);
    return { error: "初始化超级管理员失败，请重试" };
  }
}
"use server";

import crypto from "crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import { accounts, users, sessions } from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getSessionUser, ensureUserSlug } from "@/lib/auth";
import { SESSION_EXPIRY_MS } from "@/lib/constants";
import { getSetting } from "@/lib/settings";
import { verifyPendingPayload } from "@/lib/oauth-dalao";
import { hashPassword as hashPasswordScrypt, verifyPassword as verifyPasswordScrypt } from "better-auth/crypto";

export async function getPendingDalaoAuthAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get("dalao_pending_auth")?.value;
  if (!token) return { error: "授权信息已失效，请重新授权" };

  const payload = verifyPendingPayload(token);
  if (!payload) {
    return { error: "授权已过期或无效，请重新发起登录" };
  }

  return {
    success: true,
    data: {
      username: payload.username,
      email: payload.email || "",
      accountId: payload.accountId,
    },
  };
}

export async function directOAuthLoginAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get("dalao_pending_auth")?.value;
  if (!token) return { error: "授权信息已失效，请重新授权" };

  const payload = verifyPendingPayload(token);
  if (!payload) {
    return { error: "授权已过期，请重新发起登录" };
  }

  // Check system registration setting
  const allowReg = await getSetting("allow_registration");
  if (allowReg === "false") {
    return { error: "管理员已关闭新用户注册通道，请选择「绑定已有账号」进行登录" };
  }

  const accountId = payload.accountId;

  // Check if Dalao account has already been bound in the meantime
  const existingBound = await db.query.accounts.findFirst({
    where: and(eq(accounts.providerId, "dalao"), eq(accounts.accountId, accountId)),
  });
  if (existingBound) {
    return { error: "该论坛账号已被绑定，请直接登录" };
  }

  // Handle email
  let userEmail = payload.email?.trim().toLowerCase();
  if (userEmail) {
    const emailConflict = await db.query.users.findFirst({
      where: eq(users.email, userEmail),
    });
    if (emailConflict) {
      return { error: `邮箱 ${userEmail} 已存在账号，请选择「绑定已有账号」进行合并` };
    }
  } else {
    userEmail = `dalao_${accountId}@users.internal`;
  }

  // Handle username collision
  let userName = payload.username.trim() || `dalao_${accountId}`;
  const existingName = await db.query.users.findFirst({
    where: eq(users.name, userName),
  });
  if (existingName) {
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    userName = `${userName}_${randomSuffix}`;
  }

  const newUserId = crypto.randomUUID();

  // Create user
  await db.insert(users).values({
    id: newUserId,
    email: userEmail,
    name: userName,
    role: "user",
    status: "active",
    emailVerified: true,
  });

  // Assign numeric slug
  await ensureUserSlug(newUserId, userName);

  // Bind Dalao account (NO credential record with password created!)
  await db.insert(accounts).values({
    id: crypto.randomUUID(),
    accountId,
    providerId: "dalao",
    userId: newUserId,
  });

  // Issue session
  const sessionToken = crypto.randomUUID().replace(/-/g, "");
  const sessionExpiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId: newUserId,
    token: sessionToken,
    expiresAt: sessionExpiresAt,
  });

  cookieStore.set("better-auth.session_token", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: sessionExpiresAt,
    path: "/",
  });

  cookieStore.delete("dalao_pending_auth");

  return { success: true };
}

export async function bindExistingAccountAction(data: { email: string; password?: string }) {
  const { email, password } = data;
  if (!email || !password) {
    return { error: "邮箱和密码不能为空" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("dalao_pending_auth")?.value;
  if (!token) return { error: "授权信息已失效，请重新授权" };

  const payload = verifyPendingPayload(token);
  if (!payload) {
    return { error: "授权已过期，请重新发起登录" };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email.trim().toLowerCase()),
  });

  if (!user || user.status === "suspended") {
    return { error: "邮箱或密码错误" };
  }

  const credentialAccount = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")),
  });

  if (!credentialAccount || !credentialAccount.password) {
    return { error: "邮箱或密码错误" };
  }

  const valid = await verifyPasswordScrypt({ hash: credentialAccount.password, password });
  if (!valid) {
    return { error: "邮箱或密码错误" };
  }

  const accountId = payload.accountId;

  // Check if Dalao account is already bound to another user
  const existingBound = await db.query.accounts.findFirst({
    where: and(eq(accounts.providerId, "dalao"), eq(accounts.accountId, accountId)),
  });

  if (existingBound) {
    if (existingBound.userId === user.id) {
      // Already bound to this user
    } else {
      return { error: "该论坛账号已被其他用户绑定" };
    }
  } else {
    // Insert binding
    await db.insert(accounts).values({
      id: crypto.randomUUID(),
      accountId,
      providerId: "dalao",
      userId: user.id,
    });
  }

  // Issue session
  const sessionToken = crypto.randomUUID().replace(/-/g, "");
  const sessionExpiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId: user.id,
    token: sessionToken,
    expiresAt: sessionExpiresAt,
  });

  cookieStore.set("better-auth.session_token", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: sessionExpiresAt,
    path: "/",
  });

  cookieStore.delete("dalao_pending_auth");

  return { success: true };
}

export async function getDalaoBindingStatusAction() {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const dalaoAccount = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, user.id), eq(accounts.providerId, "dalao")),
  });

  const credentialAccount = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.userId, user.id),
      eq(accounts.providerId, "credential"),
      isNotNull(accounts.password)
    ),
  });

  return {
    success: true,
    isBound: !!dalaoAccount,
    dalaoAccountId: dalaoAccount?.accountId || null,
    hasCredentialPassword: !!credentialAccount?.password,
  };
}

export async function unbindDalaoAccountAction() {
  const user = await getSessionUser();
  if (!user) return { error: "请先登录" };

  // STRICT REQUIREMENT: User must have an account with a password before unbinding!
  const credentialAccount = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.userId, user.id),
      eq(accounts.providerId, "credential"),
      isNotNull(accounts.password)
    ),
  });

  if (!credentialAccount || !credentialAccount.password) {
    return {
      error: "当前账号尚未设置独立登录密码，解绑后将无法通过邮箱登录。请先在下方设置登录密码后再进行解绑。",
    };
  }

  await db.delete(accounts).where(
    and(eq(accounts.userId, user.id), eq(accounts.providerId, "dalao"))
  );

  return { success: true };
}

export async function setInitialPasswordAction(newPassword: string) {
  const user = await getSessionUser();
  if (!user) return { error: "请先登录" };

  if (!newPassword || newPassword.length < 8) {
    return { error: "密码长度至少需要 8 位" };
  }

  const existingCredential = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.userId, user.id),
      eq(accounts.providerId, "credential"),
      isNotNull(accounts.password)
    ),
  });

  if (existingCredential && existingCredential.password) {
    return { error: "您已设置过密码，请使用修改密码功能" };
  }

  const passwordHash = await hashPasswordScrypt(newPassword);

  const existingRow = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")),
  });

  if (existingRow) {
    await db.update(accounts)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(accounts.id, existingRow.id));
  } else {
    await db.insert(accounts).values({
      id: crypto.randomUUID(),
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: passwordHash,
    });
  }

  return { success: true };
}

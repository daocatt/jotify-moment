"use server";

import { db } from "@/db";
import { users, posts, settings, verificationCodes, accounts } from "@/db/schema";
import { eq, desc, lt, and } from "drizzle-orm";
import crypto from "crypto";
import { getSessionUser, verifyPassword, hashPassword } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const VALID_ROLES = ["super_admin", "admin", "user", "guest"] as const;
const VALID_STATUSES = ["active", "suspended"] as const;
const VALID_SETTING_KEYS = ["allow_registration", "require_approval", "telegram_bot_name", "telegram_bot_token", "telegram_webhook_secret"];

function isValidUrl(url: string): boolean {
  if (!url) return true;
  if (url.startsWith("/uploads/")) return true;
  const s3PublicUrl = process.env.S3_PUBLIC_URL;
  if (s3PublicUrl && url.startsWith(s3PublicUrl)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function getSettingsAction() {
  try {
    const allSettings = await db.query.settings.findMany();
    const settingsMap: Record<string, string> = {};

    settingsMap["allow_registration"] = "true";
    settingsMap["require_approval"] = "false";

    for (const s of allSettings) {
      settingsMap[s.key] = s.value;
    }

    return { success: true, settings: settingsMap };
  } catch (error) {
    console.error("getSettingsAction error:", error);
    return { error: "Failed to load settings" };
  }
}

export async function updateSettingAction(key: string, value: string) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  if (!VALID_SETTING_KEYS.includes(key)) {
    return { error: "Invalid setting key" };
  }
  if (value !== "true" && value !== "false") {
    return { error: "Invalid setting value" };
  }

  try {
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value },
      });
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("updateSettingAction error:", error);
    return { error: "Failed to update setting" };
  }
}

export async function getUsersAction() {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    const allUsers = await db.query.users.findMany({
      orderBy: [users.createdAt],
      columns: {
        id: true,
        email: true,
        name: true,
        slug: true,
        avatar: true,
        bio: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
    return { success: true, users: allUsers };
  } catch (error) {
    console.error("getUsersAction error:", error);
    return { error: "Failed to fetch users" };
  }
}

export async function updateUserStatusAction(targetUserId: string, status: string) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    return { error: "Invalid status value" };
  }

  try {
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, targetUserId),
    });

    if (!targetUser) return { error: "User not found" };
    if (targetUser.role === "super_admin") {
      return { error: "Cannot suspend the Super Admin" };
    }
    if (targetUser.id === user.id) {
      return { error: "Cannot suspend yourself" };
    }

    await db.update(users).set({ status: status as typeof VALID_STATUSES[number] }).where(eq(users.id, targetUserId));
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("updateUserStatusAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function updateUserRoleAction(targetUserId: string, role: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") {
    return { error: "Only Super Admin can change user roles" };
  }

  if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
    return { error: "Invalid role value" };
  }

  try {
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, targetUserId),
    });

    if (!targetUser) return { error: "User not found" };
    if (targetUser.id === user.id) {
      return { error: "Cannot change your own role" };
    }

    await db.update(users).set({ role: role as typeof VALID_ROLES[number] }).where(eq(users.id, targetUserId));
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("updateUserRoleAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function getPendingPostsAction() {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    const pendingPosts = await db.query.posts.findMany({
      where: eq(posts.status, "pending"),
      orderBy: [desc(posts.createdAt)],
      with: {
        author: {
          columns: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    const mapped = pendingPosts.map((post) => ({
      ...post,
      user: post.author,
    }));

    return { success: true, posts: mapped };
  } catch (error) {
    console.error("getPendingPostsAction error:", error);
    return { error: "Failed to fetch pending posts" };
  }
}

export async function approvePostAction(postId: string) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    await db.update(posts).set({ status: "approved" }).where(eq(posts.id, postId));
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("approvePostAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function updateProfileAction(data: {
  name: string;
  slug: string;
  bio: string;
  avatar: string;
  coverImage: string;
  wechat: string;
  telegram: string;
  github: string;
  x: string;
  otherLink: string;
}) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };
  if (user.status === "suspended") return { error: "Your account is suspended" };

  if (user.role === "guest") {
    if (!data.name.trim()) return { error: "Name cannot be empty" };
    try {
      await db.update(users).set({ name: data.name }).where(eq(users.id, user.id));
      revalidatePath("/");
      return { success: true };
    } catch (error) {
      console.error("updateProfileAction guest error:", error);
      return { error: "Internal server error" };
    }
  }

  if (!data.name.trim()) return { error: "Name cannot be empty" };
  if (data.avatar && !isValidUrl(data.avatar)) return { error: "Invalid avatar URL" };
  if (data.coverImage && !isValidUrl(data.coverImage)) return { error: "Invalid cover image URL" };

  const slug = data.slug.trim();
  if (slug.length > 32) return { error: "主页路径不能超过 32 位" };
  if (slug) {
    const existing = await db.query.users.findFirst({ where: eq(users.slug, slug) });
    if (existing && existing.id !== user.id) return { error: "该主页路径已被占用" };
  }

  try {
    await db
      .update(users)
      .set({
        name: data.name,
        slug: slug || null,
        bio: data.bio || null,
        avatar: data.avatar || null,
        coverImage: data.coverImage || null,
        wechat: data.wechat || null,
        telegram: data.telegram || null,
        github: data.github || null,
        x: data.x || null,
        otherLink: data.otherLink || null,
      })
      .where(eq(users.id, user.id));

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("updateProfileAction error:", error);
    return { error: "Internal server error" };
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function updateUserEmailAction(targetUserId: string, email: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") {
    return { error: "Only Super Admin can modify emails" };
  }

  const trimmed = email.trim();
  if (!trimmed) return { error: "Email cannot be empty" };
  if (!EMAIL_REGEX.test(trimmed)) return { error: "邮箱格式不正确" };

  try {
    const target = await db.query.users.findFirst({ where: eq(users.id, targetUserId) });
    if (!target) return { error: "User not found" };

    const dupe = await db.query.users.findFirst({ where: eq(users.email, trimmed) });
    if (dupe && dupe.id !== targetUserId) return { error: "该邮箱已被其他用户使用" };

    await db.update(users).set({ email: trimmed }).where(eq(users.id, targetUserId));
    await db
      .update(accounts)
      .set({ accountId: trimmed })
      .where(and(eq(accounts.userId, targetUserId), eq(accounts.providerId, "email")));

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("updateUserEmailAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function adminChangePasswordAction(targetUserId: string, newPassword: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") {
    return { error: "Only Super Admin can modify passwords" };
  }

  if (!newPassword) return { error: "Password cannot be empty" };
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { error: `密码长度至少为 ${MIN_PASSWORD_LENGTH} 位` };
  }

  try {
    const target = await db.query.users.findFirst({ where: eq(users.id, targetUserId) });
    if (!target) return { error: "User not found" };

    const passwordHash = await hashPassword(newPassword);
    await db
      .update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, targetUserId), eq(accounts.providerId, "email")));

    return { success: true };
  } catch (error) {
    console.error("adminChangePasswordAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function changePasswordAction(data: {
  currentPassword: string;
  newPassword: string;
}) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };
  if (user.status === "suspended") return { error: "Your account is suspended" };

  const { currentPassword, newPassword } = data;

  if (!currentPassword || !newPassword) {
    return { error: "请填写当前密码和新密码" };
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { error: `新密码长度至少为 ${MIN_PASSWORD_LENGTH} 位` };
  }

  if (currentPassword === newPassword) {
    return { error: "新密码不能与当前密码相同" };
  }

  try {
    const account = await db.query.accounts.findFirst({
      where: and(eq(accounts.userId, user.id), eq(accounts.providerId, "email")),
    });

    if (!account || !account.password) {
      return { error: "当前账户不支持密码修改" };
    }

    const valid = await verifyPassword(currentPassword, account.password);
    if (!valid) {
      return { error: "当前密码不正确" };
    }

    const passwordHash = await hashPassword(newPassword);
    await db
      .update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "email")));

    return { success: true };
  } catch (error) {
    console.error("changePasswordAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function cleanupExpiredCodesAction() {
  try {
    await db.delete(verificationCodes).where(
      lt(verificationCodes.expiresAt, new Date())
    );
    return { success: true };
  } catch (error) {
    console.error("cleanupExpiredCodesAction error:", error);
    return { error: "Failed to cleanup expired codes" };
  }
}

export async function getTelegramConfigAction() {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    const allSettings = await db.query.settings.findMany();
    const config: Record<string, string> = {};
    for (const s of allSettings) {
      if (s.key.startsWith("telegram_")) {
        config[s.key] = s.value;
      }
    }
    return { success: true, config };
  } catch (error) {
    console.error("getTelegramConfigAction error:", error);
    return { error: "Failed to load telegram configuration" };
  }
}

export async function integrateTelegramAction(botName: string, botToken: string, origin: string) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  if (!botName.trim() || !botToken.trim() || !origin.trim()) {
    return { error: "参数不完整" };
  }

  const webhookSecret = crypto.randomUUID().replace(/-/g, "");

  try {
    // 1. Call setWebhook via fetch
    const webhookUrl = `${origin}/api/telegram/webhook`;
    const tgUrl = `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${webhookSecret}`;
    const res = await fetch(tgUrl);
    const data = await res.json();

    if (!data.ok) {
      return { error: `Telegram Webhook 注册失败: ${data.description || "未知原因"}` };
    }

    // 2. Save to settings table
    await db.insert(settings).values({ key: "telegram_bot_name", value: botName }).onConflictDoUpdate({ target: settings.key, set: { value: botName } });
    await db.insert(settings).values({ key: "telegram_bot_token", value: botToken }).onConflictDoUpdate({ target: settings.key, set: { value: botToken } });
    await db.insert(settings).values({ key: "telegram_webhook_secret", value: webhookSecret }).onConflictDoUpdate({ target: settings.key, set: { value: webhookSecret } });

    return { success: true };
  } catch (error) {
    console.error("integrateTelegramAction error:", error);
    return { error: "集成过程中发生网络错误" };
  }
}

export async function unbindTelegramAction() {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    const botTokenSetting = await db.query.settings.findFirst({
      where: eq(settings.key, "telegram_bot_token"),
    });

    if (botTokenSetting?.value) {
      // Unregister webhook from telegram
      const tgUrl = `https://api.telegram.org/bot${botTokenSetting.value}/deleteWebhook`;
      await fetch(tgUrl).catch((e) => console.error("deleteWebhook error:", e));
    }

    // Delete keys
    await db.delete(settings).where(eq(settings.key, "telegram_bot_name"));
    await db.delete(settings).where(eq(settings.key, "telegram_bot_token"));
    await db.delete(settings).where(eq(settings.key, "telegram_webhook_secret"));

    return { success: true };
  } catch (error) {
    console.error("unbindTelegramAction error:", error);
    return { error: "解绑过程中发生错误" };
  }
}

export async function generateTelegramBindTokenAction() {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const bindToken = crypto.randomUUID().replace(/-/g, "");

  try {
    await db.update(users).set({ telegramBindToken: bindToken }).where(eq(users.id, user.id));
    return { success: true, bindToken };
  } catch (error) {
    console.error("generateTelegramBindTokenAction error:", error);
    return { error: "生成绑定 Token 失败" };
  }
}

export async function unbindUserTelegramAction() {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  try {
    await db.update(users).set({
      telegram: null,
      telegramChatId: null,
      telegramBindToken: null,
    }).where(eq(users.id, user.id));
    return { success: true };
  } catch (error) {
    console.error("unbindUserTelegramAction error:", error);
    return { error: "解绑 Telegram 失败" };
  }
}

export async function getTelegramBotNameAction() {
  try {
    const setting = await db.query.settings.findFirst({
      where: eq(settings.key, "telegram_bot_name"),
    });
    return { success: true, botName: setting?.value || null };
  } catch (error) {
    console.error("getTelegramBotNameAction error:", error);
    return { success: true, botName: null };
  }
}

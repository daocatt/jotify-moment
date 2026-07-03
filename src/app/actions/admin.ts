"use server";

import { db } from "@/db";
import { users, posts, settings, verificationCodes, accounts } from "@/db/schema";
import { eq, desc, lt, and } from "drizzle-orm";
import crypto from "crypto";
import { getSessionUser, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { hashPassword as hashPasswordScrypt, verifyPassword as verifyPasswordScrypt } from "better-auth/crypto";
import { VALID_THEME_IDS } from "@/lib/theme-resolver";
import { revalidatePath } from "next/cache";

const VALID_ROLES = ["super_admin", "admin", "user", "guest"] as const;
const VALID_STATUSES = ["active", "suspended"] as const;
const VALID_SETTING_KEYS = ["allow_registration", "require_approval", "global_theme", "telegram_bot_name", "telegram_bot_token", "telegram_webhook_secret", "allow_custom_domains"];

function isValidUrl(url: string): boolean {
  if (!url) return true;
  if (url.startsWith("/uploads/")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function getSettingsAction() {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    const allSettings = await db.query.settings.findMany();
    const settingsMap: Record<string, string> = {
      allow_registration: "true",
      require_approval: "false",
    };

    for (const s of allSettings) {
      settingsMap[s.key] = s.value;
    }

    return { success: true, settings: settingsMap };
  } catch (error) {
    console.error("getSettingsAction error:", error);
    return { error: "Failed to load settings" };
  }
}

export async function getPublicSettingsAction() {
  try {
    const allSettings = await db.query.settings.findMany();
    const settingsMap: Record<string, string> = {
      allow_registration: "true",
      require_approval: "false",
      global_theme: "default",
    };

    for (const s of allSettings) {
      if (s.key === "allow_registration" || s.key === "require_approval" || s.key === "global_theme") {
        settingsMap[s.key] = s.value;
      }
    }

    return { success: true, settings: settingsMap };
  } catch (error) {
    console.error("getPublicSettingsAction error:", error);
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
  if (key === "global_theme") {
    if (!VALID_THEME_IDS.includes(value)) {
      return { error: "Invalid theme id" };
    }
  } else if (value !== "true" && value !== "false") {
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

const ADMIN_USERS_PAGE_SIZE = 20;

export async function getUsersAction(cursor?: string) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    const allUsers = await db.query.users.findMany({
      where: cursor ? lt(users.createdAt, new Date(cursor)) : undefined,
      orderBy: [desc(users.createdAt)],
      limit: ADMIN_USERS_PAGE_SIZE + 1,
      columns: {
        id: true,
        email: true,
        name: true,
        slug: true,
        avatar: true,
        bio: true,
        role: true,
        status: true,
        loginDisabledAt: true,
        createdAt: true,
        customDomain: true,
        allowCustomDomain: true,
      },
    });

    const hasMore = allUsers.length > ADMIN_USERS_PAGE_SIZE;
    const items = hasMore ? allUsers.slice(0, ADMIN_USERS_PAGE_SIZE) : allUsers;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    return { success: true, users: items, nextCursor, hasMore };
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

export async function updateUserCustomDomainPermissionAction(targetUserId: string, allowed: boolean) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, targetUserId),
    });

    if (!targetUser) return { error: "User not found" };
    if (targetUser.role === "super_admin") {
      return { error: "Cannot restrict the Super Admin" };
    }

    await db.update(users).set({
      allowCustomDomain: allowed,
      ...(!allowed && { customDomain: null }),
    }).where(eq(users.id, targetUserId));
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("updateUserCustomDomainPermissionAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function unlockLoginAction(targetUserId: string) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, targetUserId),
    });

    if (!targetUser) return { error: "User not found" };
    if (!targetUser.loginDisabledAt) return { error: "该账号未被禁用登录" };

    await db.update(users).set({ loginDisabledAt: null }).where(eq(users.id, targetUserId));
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("unlockLoginAction error:", error);
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
  theme?: string;
  customDomain?: string;
}) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };
  if (user.status === "suspended") return { error: "Your account is suspended" };

  if (user.role === "guest") {
    if (!data.name.trim()) return { error: "用户名不能为空" };
    if (data.name.trim().length < 2) return { error: "用户名至少需要 2 个字符" };
    const trimmedName = data.name.trim();
    const existingName = await db.query.users.findFirst({
      where: eq(users.name, trimmedName),
    });
    if (existingName && existingName.id !== user.id) return { error: "该用户名已被使用" };
    try {
      await db.update(users).set({ name: trimmedName }).where(eq(users.id, user.id));
      revalidatePath("/");
      return { success: true };
    } catch (error) {
      console.error("updateProfileAction guest error:", error);
      return { error: "Internal server error" };
    }
  }

  if (!data.name.trim()) return { error: "用户名不能为空" };
  if (data.name.trim().length < 2) return { error: "用户名至少需要 2 个字符" };
  if (data.avatar && !isValidUrl(data.avatar)) return { error: "Invalid avatar URL" };
  if (data.coverImage && !isValidUrl(data.coverImage)) return { error: "Invalid cover image URL" };
  if (data.theme && !VALID_THEME_IDS.includes(data.theme)) return { error: "Invalid theme" };

  const slug = data.slug.trim();
  if (slug.length > 32) return { error: "主页路径不能超过 32 位" };
  if (slug) {
    const existing = await db.query.users.findFirst({ where: eq(users.slug, slug) });
    if (existing && existing.id !== user.id) return { error: "该主页路径已被占用" };
  }

  let customDomain = data.customDomain?.trim().toLowerCase() || null;
  if (customDomain) {
    customDomain = customDomain.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];

    const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
    if (!DOMAIN_RE.test(customDomain)) {
      return { error: "域名格式不合法，请输入如 moment.example.com 的格式" };
    }

    const mainHostEnv = process.env.MAIN_HOST || "";
    const mainHosts = mainHostEnv.split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
    if (mainHosts.includes(customDomain)) {
      return { error: "不能使用主站域名作为自定义域名" };
    }

    const globalAllowRow = await db.query.settings.findFirst({
      where: eq(settings.key, "allow_custom_domains")
    });
    const isGloballyAllowed = globalAllowRow?.value === "true";
    if (!isGloballyAllowed) {
      return { error: "系统当前未开启自定义域名功能" };
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { allowCustomDomain: true }
    });
    if (!dbUser?.allowCustomDomain) {
      return { error: "管理员已禁用您的自定义域名权限" };
    }

    const existingDomain = await db.query.users.findFirst({
      where: eq(users.customDomain, customDomain)
    });
    if (existingDomain && existingDomain.id !== user.id) {
      return { error: "该自定义域名已被其他用户使用" };
    }
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
        theme: data.theme || null,
        customDomain: customDomain,
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
      .where(and(eq(accounts.userId, targetUserId), eq(accounts.providerId, "credential")));

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

    const passwordHash = await hashPasswordScrypt(newPassword);
    await db
      .update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, targetUserId), eq(accounts.providerId, "credential")));

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
      where: and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")),
    });

    if (!account || !account.password) {
      return { error: "当前账户不支持密码修改" };
    }

    const valid = await verifyPasswordScrypt({ hash: account.password, password: currentPassword });
    if (!valid) {
      return { error: "当前密码不正确" };
    }

    const passwordHash = await hashPasswordScrypt(newPassword);
    await db
      .update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")));

    return { success: true };
  } catch (error) {
    console.error("changePasswordAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function cleanupExpiredCodesAction() {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

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
    const SECRET_KEYS = new Set(["telegram_bot_token", "telegram_webhook_secret"]);
    for (const s of allSettings) {
      if (s.key.startsWith("telegram_")) {
        config[s.key] = SECRET_KEYS.has(s.key) && s.value
          ? "****" + s.value.slice(-4)
          : s.value;
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

  if (!botName.trim() || !origin.trim()) {
    return { error: "参数不完整" };
  }

  let actualToken = botToken.trim();
  if (!actualToken || actualToken.startsWith("****")) {
    const saved = await db.query.settings.findFirst({ where: eq(settings.key, "telegram_bot_token") });
    if (!saved?.value) {
      return { error: "请输入 Bot Token" };
    }
    actualToken = saved.value;
  }

  const webhookSecret = crypto.randomUUID().replace(/-/g, "");

  try {
    const webhookUrl = `${origin}/api/telegram/webhook`;
    const tgUrl = `https://api.telegram.org/bot${actualToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${webhookSecret}`;
    const res = await fetch(tgUrl);
    const data = await res.json();

    if (!data.ok) {
      return { error: `Telegram Webhook 注册失败: ${data.description || "未知原因"}` };
    }

    await db.insert(settings).values({ key: "telegram_bot_name", value: botName }).onConflictDoUpdate({ target: settings.key, set: { value: botName } });
    await db.insert(settings).values({ key: "telegram_bot_token", value: actualToken }).onConflictDoUpdate({ target: settings.key, set: { value: actualToken } });
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

export async function getResendConfigAction() {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    const allSettings = await db.query.settings.findMany();
    const config: Record<string, string> = {};
    for (const s of allSettings) {
      if (s.key.startsWith("resend_")) {
        config[s.key] = s.key === "resend_api_key" && s.value
          ? "****" + s.value.slice(-4)
          : s.value;
      }
    }
    return { success: true, config };
  } catch (error) {
    console.error("getResendConfigAction error:", error);
    return { error: "Failed to load Resend configuration" };
  }
}

export async function saveResendConfigAction(apiKey: string, domain: string, fromName: string, fromEmail: string) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  if (!domain.trim() || !fromName.trim() || !fromEmail.trim()) {
    return { error: "参数不完整" };
  }

  let actualApiKey = apiKey.trim();
  if (!actualApiKey || actualApiKey.startsWith("****")) {
    const saved = await db.query.settings.findFirst({ where: eq(settings.key, "resend_api_key") });
    if (!saved?.value) {
      return { error: "请输入 API Key" };
    }
    actualApiKey = saved.value;
  }

  try {
    await db.insert(settings).values({ key: "resend_api_key", value: actualApiKey }).onConflictDoUpdate({ target: settings.key, set: { value: actualApiKey } });
    await db.insert(settings).values({ key: "resend_domain", value: domain }).onConflictDoUpdate({ target: settings.key, set: { value: domain } });
    await db.insert(settings).values({ key: "resend_from_name", value: fromName }).onConflictDoUpdate({ target: settings.key, set: { value: fromName } });
    await db.insert(settings).values({ key: "resend_from_email", value: fromEmail }).onConflictDoUpdate({ target: settings.key, set: { value: fromEmail } });
    return { success: true };
  } catch (error) {
    console.error("saveResendConfigAction error:", error);
    return { error: "保存 Resend 配置失败" };
  }
}

export async function deleteResendConfigAction() {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    await db.delete(settings).where(eq(settings.key, "resend_api_key"));
    await db.delete(settings).where(eq(settings.key, "resend_domain"));
    await db.delete(settings).where(eq(settings.key, "resend_from_name"));
    await db.delete(settings).where(eq(settings.key, "resend_from_email"));
    return { success: true };
  } catch (error) {
    console.error("deleteResendConfigAction error:", error);
    return { error: "删除 Resend 配置失败" };
  }
}

export async function getStorageConfigAction() {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    const allSettings = await db.query.settings.findMany();
    const config: Record<string, string> = {};
    for (const s of allSettings) {
      if (s.key.startsWith("storage_")) {
        config[s.key] = s.key === "storage_s3_secret_access_key" && s.value
          ? "****" + s.value.slice(-4)
          : s.value;
      }
    }
    return { success: true, config };
  } catch (error) {
    console.error("getStorageConfigAction error:", error);
    return { error: "Failed to load storage configuration" };
  }
}

export async function saveStorageConfigAction(data: {
  mode: string;
  maxFileSizeMB: string;
  allowedExtensions: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3BucketName: string;
  s3Endpoint: string;
  s3Region: string;
  s3PublicUrl: string;
}) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  if (!data.mode || (data.mode !== "local" && data.mode !== "s3")) {
    return { error: "Invalid storage mode" };
  }

  if (data.mode === "s3") {
    if (!data.s3AccessKeyId.trim() || !data.s3BucketName.trim()) {
      return { error: "S3 模式需要填写 Access Key ID 和 Bucket Name" };
    }
    if (!data.s3SecretAccessKey.trim() || data.s3SecretAccessKey.startsWith("****")) {
      const saved = await db.query.settings.findFirst({ where: eq(settings.key, "storage_s3_secret_access_key") });
      if (!saved?.value) {
        return { error: "S3 模式需要填写 Secret Access Key" };
      }
      data.s3SecretAccessKey = saved.value;
    }
  }

  const mb = parseInt(data.maxFileSizeMB, 10);
  if (isNaN(mb) || mb < 1 || mb > 500) {
    return { error: "文件大小限制必须在 1-500 MB 之间" };
  }

  if (!data.allowedExtensions.trim()) {
    return { error: "请至少配置一个允许的文件后缀" };
  }

  try {
    const upserts: Record<string, string> = {
      storage_mode: data.mode,
      storage_max_file_size_mb: String(mb),
      storage_allowed_extensions: data.allowedExtensions.trim(),
      storage_s3_access_key_id: data.s3AccessKeyId.trim(),
      storage_s3_secret_access_key: data.s3SecretAccessKey.trim(),
      storage_s3_bucket_name: data.s3BucketName.trim(),
      storage_s3_endpoint: data.s3Endpoint.trim(),
      storage_s3_region: data.s3Region.trim() || "auto",
      storage_s3_public_url: data.s3PublicUrl.trim(),
    };

    for (const [key, value] of Object.entries(upserts)) {
      await db.insert(settings).values({ key, value }).onConflictDoUpdate({
        target: settings.key,
        set: { value },
      });
    }

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("saveStorageConfigAction error:", error);
    return { error: "保存上传配置失败" };
  }
}

export async function updateFaviconAction(faviconUrl: string) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    await db.insert(settings).values({ key: "site_favicon", value: faviconUrl }).onConflictDoUpdate({
      target: settings.key,
      set: { value: faviconUrl },
    });
    revalidatePath("/");
    revalidatePath("/api/favicon");
    return { success: true };
  } catch (error) {
    console.error("updateFaviconAction error:", error);
    return { error: "更新图标失败" };
  }
}

export async function adminCreateUserAction(data: {
  email: string;
  password: string;
  allowCustomDomain: boolean;
  role: "admin" | "user" | "guest";
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "super_admin") {
    return { error: "Unauthorized" };
  }

  const { email, password, allowCustomDomain, role } = data;
  if (!email || !password) {
    return { error: "邮箱和密码不能为空" };
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `密码长度至少为 ${MIN_PASSWORD_LENGTH} 位` };
  }

  if (!["admin", "user", "guest"].includes(role)) {
    return { error: "无效的用户角色" };
  }

  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, trimmedEmail),
    });

    if (existingUser) {
      return { error: "该邮箱已被注册" };
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPasswordScrypt(password);
    const name = trimmedEmail.split("@")[0] || "User";

    let slugCandidate: string | null = null;
    if (role !== "guest") {
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = Math.floor(10000000 + Math.random() * 90000000).toString();
        const conflict = await db.query.users.findFirst({ where: eq(users.slug, candidate) });
        if (!conflict) {
          slugCandidate = candidate;
          break;
        }
      }
      if (!slugCandidate) {
        return { error: "生成用户标识失败，请稍后重试" };
      }
    }

    await db.insert(users).values({
      id: userId,
      email: trimmedEmail,
      name,
      slug: slugCandidate,
      role,
      allowCustomDomain,
      emailVerified: true,
      status: "active",
    });

    await db.insert(accounts).values({
      id: crypto.randomUUID(),
      accountId: trimmedEmail,
      providerId: "credential",
      userId,
      password: passwordHash,
    });

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("adminCreateUserAction error:", error);
    return { error: "新增用户失败，请稍后重试" };
  }
}


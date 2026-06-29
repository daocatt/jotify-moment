"use server";

import { db } from "@/db";
import { users, posts, settings, verificationCodes } from "@/db/schema";
import { eq, desc, lt } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const VALID_ROLES = ["super_admin", "admin", "user"] as const;
const VALID_STATUSES = ["active", "suspended"] as const;
const VALID_SETTING_KEYS = ["allow_registration", "require_approval"];

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
  bio: string;
  avatar: string;
  coverImage: string;
}) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };
  if (user.status === "suspended") return { error: "Your account is suspended" };

  if (!data.name.trim()) return { error: "Name cannot be empty" };
  if (data.avatar && !isValidUrl(data.avatar)) return { error: "Invalid avatar URL" };
  if (data.coverImage && !isValidUrl(data.coverImage)) return { error: "Invalid cover image URL" };

  try {
    await db
      .update(users)
      .set({
        name: data.name,
        bio: data.bio,
        avatar: data.avatar || null,
        coverImage: data.coverImage || null,
      })
      .where(eq(users.id, user.id));

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("updateProfileAction error:", error);
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

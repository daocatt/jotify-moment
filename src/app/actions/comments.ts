"use server";

import { db } from "@/db";
import { comments, users, posts } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const VALID_COMMENT_STATUSES = ["active", "hidden"] as const;

/**
 * Admin Action: Get paginated list of all comments for comment management.
 */
export async function getAdminCommentsAction(page: number = 1, limit: number = 20) {
  try {
    const user = await getSessionUser();
    if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
      return { error: "Unauthorized" };
    }

    const offset = (page - 1) * limit;

    const [totalRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments);

    const list = await db.query.comments.findMany({
      orderBy: [desc(comments.createdAt)],
      limit,
      offset,
      with: {
        author: {
          columns: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    return {
      success: true,
      comments: list,
      total: totalRows?.count || 0,
    };
  } catch (error) {
    console.error("getAdminCommentsAction error:", error);
    return { error: "Internal server error" };
  }
}

/**
 * Admin Action: Toggle the visibility (hide / active) of a comment.
 */
export async function toggleCommentVisibilityAction(commentId: string, hide: boolean) {
  try {
    const user = await getSessionUser();
    if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
      return { error: "Unauthorized" };
    }

    const status = hide ? "hidden" : "active";
    await db.update(comments).set({ status: status as "active" | "hidden" }).where(eq(comments.id, commentId));

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("toggleCommentVisibilityAction error:", error);
    return { error: "Internal server error" };
  }
}

/**
 * Owner Action: Update comment content.
 * Allowed only within 5 minutes of creation.
 */
export async function updateCommentAction(commentId: string, content: string) {
  try {
    const user = await getSessionUser();
    if (!user) return { error: "Unauthorized" };

    const trimmed = content.trim();
    if (!trimmed) return { error: "评论内容不能为空" };
    if (trimmed.length > 500) return { error: "评论内容不能超过 500 字" };

    // Fetch existing comment
    const existing = await db.query.comments.findFirst({
      where: eq(comments.id, commentId),
    });

    if (!existing) {
      return { error: "评论不存在" };
    }

    if (existing.userId !== user.id) {
      return { error: "您没有权限编辑此评论" };
    }

    // Check 5-minute limit
    const elapsedMs = Date.now() - existing.createdAt.getTime();
    const limitMs = 5 * 60 * 1000;
    if (elapsedMs > limitMs) {
      return { error: "评论发布已超过 5 分钟，无法编辑" };
    }

    await db.update(comments).set({ content: trimmed }).where(eq(comments.id, commentId));

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("updateCommentAction error:", error);
    return { error: "Internal server error" };
  }
}

/**
 * Owner / Admin Action: Delete comment.
 */
export async function deleteCommentAction(commentId: string) {
  try {
    const user = await getSessionUser();
    if (!user) return { error: "Unauthorized" };

    const existing = await db.query.comments.findFirst({
      where: eq(comments.id, commentId),
    });

    if (!existing) {
      return { error: "评论不存在" };
    }

    const isAdmin = user.role === "super_admin" || user.role === "admin";
    const isOwner = existing.userId === user.id;

    if (!isAdmin && !isOwner) {
      return { error: "您没有权限删除此评论" };
    }

    await db.delete(comments).where(eq(comments.id, commentId));

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("deleteCommentAction error:", error);
    return { error: "Internal server error" };
  }
}

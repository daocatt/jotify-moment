"use server";

import { db } from "@/db";
import { posts, comments, reactions, settings } from "@/db/schema";
import { eq, and, desc, asc, lt } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { deleteMediaFiles } from "@/lib/storage";

const PAGE_SIZE = 20;

export async function createPostAction(data: {
  content: string;
  mediaUrls: Array<{ type: string; url: string; name: string; duration?: number }>;
  ytVideoId: string | null;
}) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };
  if (user.status === "suspended") return { error: "Your account is suspended" };

  try {
    const requireApprovalRow = await db.query.settings.findFirst({
      where: eq(settings.key, "require_approval"),
    });
    const requireApproval = requireApprovalRow?.value === "true";
    const status = (requireApproval && user.role === "user") ? "pending" : "approved";

    await db.insert(posts).values({
      userId: user.id,
      content: data.content,
      mediaUrls: data.mediaUrls,
      ytVideoId: data.ytVideoId,
      status,
    });

    revalidatePath("/");
    return { success: true, pending: status === "pending" };
  } catch (error) {
    console.error("createPostAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function getPostsAction(cursor?: string) {
  const currentUser = await getSessionUser();
  const isAdmin = currentUser && (currentUser.role === "super_admin" || currentUser.role === "admin");

  try {
    const allPosts = await db.query.posts.findMany({
      where: isAdmin
        ? (cursor ? and(lt(posts.createdAt, new Date(cursor))) : undefined)
        : (cursor ? and(eq(posts.status, "approved"), lt(posts.createdAt, new Date(cursor))) : eq(posts.status, "approved")),
      orderBy: [desc(posts.createdAt)],
      limit: PAGE_SIZE + 1,
      with: {
        author: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
        comments: {
          orderBy: [asc(comments.createdAt)],
          with: {
            author: {
              columns: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
        reactions: {
          with: {
            author: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const hasMore = allPosts.length > PAGE_SIZE;
    const items = hasMore ? allPosts.slice(0, PAGE_SIZE) : allPosts;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    const mapped = items.map((post) => ({
      ...post,
      user: post.author,
      comments: post.comments.map((c) => ({
        ...c,
        userId: c.author,
      })),
      reactions: post.reactions.map((r) => ({
        ...r,
        userId: r.author,
      })),
    }));

    return { success: true, posts: mapped, nextCursor, hasMore };
  } catch (error) {
    console.error("getPostsAction error:", error);
    return { error: "Failed to fetch posts" };
  }
}

export async function deletePostAction(postId: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  try {
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
    });

    if (!post) return { error: "Post not found" };

    const isPostAdmin = user.role === "super_admin" || user.role === "admin";
    const isOwner = post.userId === user.id;

    if (!isPostAdmin && !isOwner) {
      return { error: "Unauthorized to delete this post" };
    }

    const mediaUrls = post.mediaUrls as Array<{ type: string; url: string; name: string; duration?: number }>;
    await deleteMediaFiles(mediaUrls);

    await db.delete(posts).where(eq(posts.id, postId));
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("deletePostAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function addCommentAction(postId: string, content: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };
  if (user.status === "suspended") return { error: "Your account is suspended" };
  if (!content.trim()) return { error: "Comment content cannot be empty" };

  try {
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
    });
    if (!post) return { error: "Post not found" };
    if (post.status !== "approved") {
      const isPostAdmin = user.role === "super_admin" || user.role === "admin";
      if (!isPostAdmin) return { error: "Cannot comment on a pending post" };
    }

    await db.insert(comments).values({
      postId,
      userId: user.id,
      content,
    });

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("addCommentAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function deleteCommentAction(commentId: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  try {
    const comment = await db.query.comments.findFirst({
      where: eq(comments.id, commentId),
    });

    if (!comment) return { error: "Comment not found" };

    const isCommentAdmin = user.role === "super_admin" || user.role === "admin";
    const isOwner = comment.userId === user.id;

    if (!isCommentAdmin && !isOwner) {
      return { error: "Unauthorized to delete this comment" };
    }

    await db.delete(comments).where(eq(comments.id, commentId));
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("deleteCommentAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function toggleReactionAction(postId: string, emoji: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };
  if (user.status === "suspended") return { error: "Your account is suspended" };

  const ALLOWED_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🎉", "🙏"];
  if (!ALLOWED_EMOJIS.includes(emoji)) {
    return { error: "Invalid emoji" };
  }

  try {
    const existing = await db.query.reactions.findFirst({
      where: and(
        eq(reactions.postId, postId),
        eq(reactions.userId, user.id),
        eq(reactions.emoji, emoji)
      ),
    });

    if (existing) {
      await db.delete(reactions).where(eq(reactions.id, existing.id));
    } else {
      await db.insert(reactions).values({
        postId,
        userId: user.id,
        emoji,
      }).onConflictDoNothing();
    }

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("toggleReactionAction error:", error);
    return { error: "Internal server error" };
  }
}

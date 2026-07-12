"use server";

import { db } from "@/db";
import { posts, comments, reactions, settings, users, userPinned } from "@/db/schema";
import { eq, and, desc, asc, lt, isNotNull, isNull, count, inArray } from "drizzle-orm";
import { getSessionUser, ensureUserSlug } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { isValidEmbedId, resolveBilibiliShortLink, type EmbedType } from "@/lib/embed-parser";
import { deleteMediaFiles } from "@/lib/storage";

const PAGE_SIZE = 15;
const MAX_POST_LENGTH = 1000;
const MAX_PINNED = 5;

export async function generateUniquePostId(): Promise<string> {
  const maxAttempts = 15;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const id = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    const existing = await db.query.posts.findFirst({
      where: eq(posts.id, id),
    });
    if (!existing) return id;
  }
  throw new Error("Failed to generate unique 10-digit post ID");
}

export async function createPostAction(data: {
  content: string;
  mediaUrls: Array<{ type: string; url: string; name: string; duration?: number; thumbnailUrl?: string }>;
  ytVideoId?: string | null;
  embedType?: string | null;
  embedId?: string | null;
}) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };
  if (user.status === "suspended") return { error: "Your account is suspended" };
  if (user.role === "guest") return { error: "访客用户不能发布 Moment" };

  if (data.content.length > MAX_POST_LENGTH) {
    return { error: `内容不能超过 ${MAX_POST_LENGTH} 字` };
  }

  // Backward compat: if caller still passes ytVideoId, convert to embedType/embedId
  let embedType = data.embedType ?? null;
  let embedId = data.embedId ?? null;
  if (!embedType && data.ytVideoId) {
    embedType = "youtube";
    embedId = data.ytVideoId;
  }

  // Validate embed ID format
  if (embedType && !embedId) {
    return { error: "嵌入内容 ID 不能为空" };
  }
  if (embedType && embedId && !isValidEmbedId(embedType as EmbedType, embedId)) {
    return { error: "嵌入内容 ID 格式无效" };
  }

  // Resolve b23.tv short links to full BV IDs before storing in DB
  if (embedType === "bilibili" && embedId) {
    const isBV = embedId.toUpperCase().startsWith("BV");
    const isAV = embedId.toLowerCase().startsWith("av");
    if (!isBV && !isAV) {
      const resolved = await resolveBilibiliShortLink(embedId);
      if (resolved) embedId = resolved;
    }
  }

  // Fetch embed meta server-side (thumbnail + title) so the client never needs to call external APIs
  let embedMeta: { thumbnailUrl?: string; title?: string } | null = null;
  if (embedType && embedId) {
    try {
      embedMeta = await fetchEmbedMeta(embedType, embedId);
    } catch {
      // non-fatal — render will still work, just without cached thumbnail
    }
  }

  try {
    const requireApprovalRow = await db.query.settings.findFirst({
      where: eq(settings.key, "require_approval"),
    });
    const requireApproval = requireApprovalRow?.value === "true";
    const status = (requireApproval && user.role === "user") ? "pending" : "approved";

    const postId = await generateUniquePostId();

    await db.insert(posts).values({
      id: postId,
      userId: user.id,
      content: data.content,
      mediaUrls: data.mediaUrls,
      // Keep ytVideoId populated for backward compat with existing data
      ytVideoId: embedType === "youtube" ? embedId : null,
      embedType,
      embedId,
      embedMeta,
      status,
    });

    revalidatePath("/");
    return { success: true, pending: status === "pending" };
  } catch (error) {
    console.error("createPostAction error:", error);
    return { error: "Internal server error" };
  }
}

/**
 * Fetch thumbnail + title for an embed from its platform API.
 * Called once at post-creation time; result stored in embedMeta.
 */
async function fetchEmbedMeta(
  embedType: string,
  embedId: string
): Promise<{ thumbnailUrl?: string; title?: string }> {
  // Guard: reject malformed IDs before making any external request
  if (!isValidEmbedId(embedType as EmbedType, embedId)) {
    return {};
  }
  const timeout = 4000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);

  try {
    switch (embedType) {
      case "youtube": {
        // YouTube oEmbed — no API key needed
        const url = `https://www.youtube.com/oembed?url=https://youtu.be/${embedId}&format=json`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (res.ok) {
          const json = await res.json() as { title?: string; thumbnail_url?: string };
          return { title: json.title, thumbnailUrl: json.thumbnail_url };
        }
        break;
      }
      case "bilibili": {
        // Bilibili public API — resolves BV/AV to cover image
        // If embedId is a b23.tv short code (not BV/av), resolve it first
        let biliId = embedId;
        if (!biliId.toUpperCase().startsWith("BV") && !biliId.toLowerCase().startsWith("av")) {
          const resolved = await resolveBilibiliShortLink(biliId);
          if (resolved) biliId = resolved;
        }
        const isBV = biliId.toUpperCase().startsWith("BV");
        const param = isBV ? `bvid=${biliId}` : `aid=${biliId.slice(2)}`;
        const res = await fetch(
          `https://api.bilibili.com/x/web-interface/view?${param}`,
          { signal: ctrl.signal }
        );
        if (res.ok) {
          const json = await res.json() as { data?: { title?: string; pic?: string } };
          return {
            title: json.data?.title,
            thumbnailUrl: json.data?.pic,
          };
        }
        break;
      }
      case "tiktok": {
        // TikTok oEmbed
        const videoUrl = embedId.length > 15
          ? `https://www.tiktok.com/video/${embedId}`
          : `https://vm.tiktok.com/${embedId}`;
        const res = await fetch(
          `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`,
          { signal: ctrl.signal }
        );
        if (res.ok) {
          const json = await res.json() as { title?: string; thumbnail_url?: string };
          return { title: json.title, thumbnailUrl: json.thumbnail_url };
        }
        break;
      }
      case "spotify":
      case "spotify-podcast": {
        // Spotify oEmbed
        const spotifyUrl = `https://open.spotify.com/${embedId}`;
        const res = await fetch(
          `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`,
          { signal: ctrl.signal }
        );
        if (res.ok) {
          const json = await res.json() as { title?: string; thumbnail_url?: string };
          return { title: json.title, thumbnailUrl: json.thumbnail_url };
        }
        break;
      }
      // Netease / Apple Music / Apple Podcast don't have easy public oEmbed APIs
      // — leave embedMeta null, render will use platform logo as placeholder
    }
  } finally {
    clearTimeout(timer);
  }
  return {};
}


import { getPostsQuery } from "@/db/queries";

export async function getPostsAction(cursor?: string) {
  const currentUser = await getSessionUser();
  const isAdmin = currentUser && (currentUser.role === "super_admin" || currentUser.role === "admin");

  try {
    const res = await getPostsQuery(!!isAdmin, cursor);
    return { success: true, ...res };
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

    const mediaUrls = post.mediaUrls as Array<{ type: string; url: string; name: string; duration?: number; thumbnailUrl?: string }>;
    await deleteMediaFiles(mediaUrls);

    await db.delete(posts).where(eq(posts.id, postId));
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("deletePostAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function updatePostAction(postId: string, content: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  try {
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
    });

    if (!post) return { error: "Post not found" };
    if (post.userId !== user.id) return { error: "Unauthorized" };
    if (!content.trim()) return { error: "内容不能为空" };
    if (content.length > MAX_POST_LENGTH) {
      return { error: `内容不能超过 ${MAX_POST_LENGTH} 字` };
    }

    await db.update(posts).set({ content: content.trim() }).where(eq(posts.id, postId));
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("updatePostAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function getPinnedPostsAction() {
  const currentUser = await getSessionUser();
  const isAdmin = currentUser && (currentUser.role === "super_admin" || currentUser.role === "admin");

  try {
    const pinnedPosts = await db.query.posts.findMany({
      where: isAdmin
        ? isNotNull(posts.pinnedAt)
        : and(eq(posts.status, "approved"), isNotNull(posts.pinnedAt)),
      orderBy: [asc(posts.pinnedAt)],
      limit: MAX_PINNED,
      with: {
        author: {
          columns: { id: true, name: true, avatar: true, role: true, slug: true },
        },
        comments: {
          columns: {
            id: true,
            status: true,
          },
          where: isAdmin ? undefined : eq(comments.status, "active"),
        },
        reactions: {
          with: { author: { columns: { id: true, name: true } } },
        },
      },
    });

    const mapped = pinnedPosts.map((post) => ({
      ...post,
      user: post.author,
      comments: post.comments.map((c) => ({
        id: c.id,
        content: "",
        createdAt: post.createdAt, // dummy
        status: c.status,
        userId: { id: "", name: "", avatar: null },
      })),
      reactions: post.reactions.map((r) => ({ ...r, userId: r.author })),
    }));

    return { success: true, posts: mapped };
  } catch (error) {
    console.error("getPinnedPostsAction error:", error);
    return { error: "Failed to fetch pinned posts" };
  }
}

export async function pinPostAction(postId: string) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    const post = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
    if (!post) return { error: "Post not found" };
    if (post.pinnedAt) return { error: "该帖子已置顶" };

    const pinnedCount = await db.query.posts.findMany({
      where: isNotNull(posts.pinnedAt),
      columns: { id: true },
    });
    if (pinnedCount.length >= MAX_PINNED) {
      return { error: `最多只能置顶 ${MAX_PINNED} 条` };
    }

    await db.update(posts).set({ pinnedAt: new Date() }).where(eq(posts.id, postId));
    revalidatePath("/");
    revalidatePath("/pinned");
    return { success: true };
  } catch (error) {
    console.error("pinPostAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function unpinPostAction(postId: string) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  try {
    const post = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
    if (!post) return { error: "Post not found" };
    if (!post.pinnedAt) return { error: "该帖子未置顶" };

    await db.update(posts).set({ pinnedAt: null }).where(eq(posts.id, postId));
    revalidatePath("/");
    revalidatePath("/pinned");
    return { success: true };
  } catch (error) {
    console.error("unpinPostAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function pinPostToProfileAction(postId: string) {
  const user = await getSessionUser();
  if (!user || user.role === "guest") return { error: "Unauthorized" };

  try {
    const post = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
    if (!post) return { error: "Post not found" };
    if (post.userId !== user.id) return { error: "只能置顶自己的帖子" };

    const existing = await db.query.userPinned.findFirst({
      where: and(eq(userPinned.userId, user.id), eq(userPinned.postId, postId)),
    });
    if (existing) return { error: "该帖子已在主页置顶" };

    const [{ count: pinnedCount }] = await db
      .select({ count: count() })
      .from(userPinned)
      .where(eq(userPinned.userId, user.id));
    if (pinnedCount >= 5) return { error: "主页置顶最多 5 个" };

    await db.insert(userPinned).values({ userId: user.id, postId });
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("pinPostToProfileAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function unpinPostFromProfileAction(postId: string) {
  const user = await getSessionUser();
  if (!user || user.role === "guest") return { error: "Unauthorized" };

  try {
    await db.delete(userPinned)
      .where(and(eq(userPinned.userId, user.id), eq(userPinned.postId, postId)));
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("unpinPostFromProfileAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function getUserPinnedPostsAction(slug: string) {
  try {
    const target = await db.query.users.findFirst({
      where: eq(users.slug, slug),
      columns: { id: true },
    });
    if (!target) return { posts: [] };

    const pinnedRows = await db.query.userPinned.findMany({
      where: eq(userPinned.userId, target.id),
      orderBy: [asc(userPinned.createdAt)],
      columns: { postId: true },
    });

    if (pinnedRows.length === 0) return { posts: [] };

    const postIds = pinnedRows.map((r) => r.postId);
    const pinnedPosts = await db.query.posts.findMany({
      where: and(eq(posts.status, "approved"), inArray(posts.id, postIds)),
      orderBy: [asc(posts.createdAt)],
      with: {
        author: { columns: { id: true, name: true, avatar: true, role: true, slug: true } },
        comments: {
          columns: { id: true, status: true },
        },
        reactions: { with: { author: { columns: { id: true, name: true } } } },
      },
    });

    const sorted = postIds
      .map((id) => pinnedPosts.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p);

    const mapped = sorted.map((post) => ({
      ...post,
      user: post.author,
      comments: post.comments.map((c) => ({
        id: c.id,
        content: "",
        createdAt: post.createdAt,
        status: c.status,
        userId: { id: "", name: "", avatar: null },
      })),
      reactions: post.reactions.map((r) => ({ ...r, userId: r.author })),
    }));

    return { posts: mapped };
  } catch (error) {
    console.error("getUserPinnedPostsAction error:", error);
    return { posts: [] };
  }
}

export async function getUserBySlugAction(slug: string) {
  try {
    const target = await db.query.users.findFirst({
      where: eq(users.slug, slug),
      columns: {
        id: true, name: true, slug: true, avatar: true, bio: true, coverImage: true, role: true, status: true,
        wechat: true, telegram: true, github: true, x: true, otherLink: true, theme: true,
        customDomain: true, allowCustomDomain: true,
      },
    });
    if (!target) return { error: "用户不存在" };
    if (target.role === "guest") return { error: "该用户为访客用户，无个人主页" };
    return { success: true, user: target };
  } catch (error) {
    console.error("getUserBySlugAction error:", error);
    return { error: "Failed to fetch user" };
  }
}

export async function getUserPostsAction(slug: string, cursor?: string) {
  const currentUser = await getSessionUser();
  const isAdmin = currentUser && (currentUser.role === "super_admin" || currentUser.role === "admin");

  try {
    const target = await db.query.users.findFirst({
      where: eq(users.slug, slug),
      columns: { id: true },
    });
    if (!target) return { error: "用户不存在" };

    const userPosts = await db.query.posts.findMany({
      where: isAdmin
        ? and(
            eq(posts.userId, target.id),
            isNull(posts.pinnedAt),
            cursor ? lt(posts.createdAt, new Date(cursor)) : undefined
          )
        : and(
            eq(posts.userId, target.id),
            eq(posts.status, "approved"),
            isNull(posts.pinnedAt),
            cursor ? lt(posts.createdAt, new Date(cursor)) : undefined
          ),
      orderBy: [desc(posts.createdAt)],
      limit: PAGE_SIZE + 1,
      with: {
        author: {
          columns: { id: true, name: true, avatar: true, role: true, slug: true },
        },
        comments: {
          columns: {
            id: true,
            status: true,
          },
          where: isAdmin ? undefined : eq(comments.status, "active"),
        },
        reactions: {
          with: { author: { columns: { id: true, name: true } } },
        },
      },
    });

    const hasMore = userPosts.length > PAGE_SIZE;
    const items = hasMore ? userPosts.slice(0, PAGE_SIZE) : userPosts;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    const mapped = items.map((post) => ({
      ...post,
      user: post.author,
      comments: post.comments.map((c) => ({
        id: c.id,
        content: "",
        createdAt: post.createdAt,
        status: c.status,
        userId: { id: "", name: "", avatar: null },
      })),
      reactions: post.reactions.map((r) => ({ ...r, userId: r.author })),
    }));

    return { success: true, posts: mapped, nextCursor, hasMore };
  } catch (error) {
    console.error("getUserPostsAction error:", error);
    return { error: "Failed to fetch user posts" };
  }
}

export async function getSuperAdminProfileAction() {
  try {
    const admin = await db.query.users.findFirst({
      where: eq(users.role, "super_admin"),
      columns: { id: true, name: true, slug: true, avatar: true, bio: true, coverImage: true, role: true, wechat: true, telegram: true, github: true, x: true, otherLink: true, theme: true, customDomain: true, allowCustomDomain: true },
    });
    if (!admin) return { error: "No super admin" };
    let slug = admin.slug;
    if (!slug) {
      slug = await ensureUserSlug(admin.id, admin.name);
    }
    return { success: true, user: { ...admin, slug } };
  } catch (error) {
    console.error("getSuperAdminProfileAction error:", error);
    return { error: "Failed to fetch admin profile" };
  }
}

export async function addCommentAction(postId: string, content: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };
  if (user.status === "suspended") return { error: "Your account is suspended" };
  if (!content.trim()) return { error: "Comment content cannot be empty" };
  if (content.length > 500) return { error: "评论内容不能超过 500 字" };

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
    revalidatePath(`/mo/${postId}`);
    return { success: true };
  } catch (error) {
    console.error("addCommentAction error:", error);
    return { error: "Internal server error" };
  }
}

export async function toggleReactionAction(postId: string, emoji: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };
  if (user.status === "suspended") return { error: "Your account is suspended" };

  const ALLOWED_EMOJIS = ["❤️", "👍", "🔥", "😂", "😮", "😢", "🎉", "🙏"];
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

export async function getPostByIdAction(postId: string) {
  const currentUser = await getSessionUser();
  const isAdmin = currentUser && (currentUser.role === "super_admin" || currentUser.role === "admin");

  try {
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
      with: {
        author: {
          columns: { id: true, name: true, avatar: true, role: true, slug: true },
        },
        comments: {
          orderBy: [asc(comments.createdAt)],
          where: isAdmin ? undefined : eq(comments.status, "active"),
          with: { author: { columns: { id: true, name: true, avatar: true } } },
        },
        reactions: {
          with: { author: { columns: { id: true, name: true } } },
        },
      },
    });

    if (!post) return { error: "Post not found" };

    // Guard: pending posts are only visible to author and admin
    if (post.status !== "approved") {
      const isOwner = currentUser && post.userId === currentUser.id;
      if (!isOwner && !isAdmin) {
        return { error: "Unauthorized" };
      }
    }

    const mapped = {
      ...post,
      user: post.author,
      comments: post.comments.map((c) => ({ ...c, userId: c.author })),
      reactions: post.reactions.map((r) => ({ ...r, userId: r.author })),
    };

    return { success: true, post: mapped };
  } catch (error) {
    console.error("getPostByIdAction error:", error);
    return { error: "Failed to fetch post details" };
  }
}

export async function checkCustomDomainAvailabilityAction() {
  try {
    const globalAllowRow = await db.query.settings.findFirst({
      where: eq(settings.key, "allow_custom_domains")
    });
    return { success: true, allowed: globalAllowRow?.value === "true" };
  } catch (error) {
    console.error("checkCustomDomainAvailabilityAction error:", error);
    return { success: false, allowed: false };
  }
}

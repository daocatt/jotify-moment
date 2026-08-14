"use server";

import { db } from "@/db";
import { posts, comments, reactions, users, userPinned } from "@/db/schema";
import { eq, and, or, desc, asc, lt, isNotNull, isNull, count, inArray } from "drizzle-orm";
import { getSessionUser, ensureUserSlug } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { isValidEmbedId, resolveBilibiliShortLink, type EmbedType } from "@/lib/embed-parser";
import { deleteMediaFiles, isAllowedMediaUrl } from "@/lib/storage";
import { RateLimiter } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";

const PAGE_SIZE = 15;
const MAX_POST_LENGTH = 1000;
const MAX_PINNED = 5;

const INTERACTION_RATE_LIMITER = new RateLimiter(30, 60_000);
const POST_RATE_LIMITER = new RateLimiter(5, 60_000);

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

  if (!POST_RATE_LIMITER.allow(user.id)) {
    return { error: "发布过于频繁，请稍后再试" };
  }

  // Validate media URLs: only files produced by this app's upload pipeline,
  // bounded in count and field sizes.
  if (data.mediaUrls.length > 9) {
    return { error: "每条动态最多附带 9 个媒体文件" };
  }
  const VALID_MEDIA_TYPES = ["image", "video", "audio"];
  for (const m of data.mediaUrls) {
    if (!VALID_MEDIA_TYPES.includes(m.type)) {
      return { error: "无效的媒体类型" };
    }
    if (typeof m.name !== "string" || m.name.length > 200) {
      return { error: "无效的媒体文件名" };
    }
    if (typeof m.url !== "string" || !(await isAllowedMediaUrl(m.url))) {
      return { error: "无效的媒体 URL" };
    }
    if (m.duration !== undefined && (typeof m.duration !== "number" || m.duration < 0 || m.duration > 24 * 3600)) {
      return { error: "无效的媒体时长" };
    }
    if (m.thumbnailUrl !== undefined && (typeof m.thumbnailUrl !== "string" || !(await isAllowedMediaUrl(m.thumbnailUrl)))) {
      return { error: "无效的缩略图 URL" };
    }
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

  try {
    const requireApproval = (await getSetting("require_approval")) === "true";
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
      embedMeta: null,
      status,
    });

    // Fetch embed meta (thumbnail + title) in the background so publishing
    // never blocks on external oEmbed APIs. Pages are force-dynamic, so the
    // enrichment is picked up on the next visit.
    if (embedType && embedId) {
      void (async () => {
        try {
          const meta = await fetchEmbedMeta(embedType as EmbedType, embedId);
          if (meta && (meta.title || meta.thumbnailUrl)) {
            await db.update(posts).set({ embedMeta: meta }).where(eq(posts.id, postId));
          }
        } catch (err) {
          console.error("embedMeta background enrichment failed:", err);
        }
      })();
    }

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


import { getPostsQuery, parseCursor, makeCursor, loadReactions } from "@/db/queries";

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
      },
    });

    const reactionsMap = await loadReactions(pinnedPosts.map((p) => p.id));

    const mapped = pinnedPosts.map((post) => {
      const summary = reactionsMap.get(post.id);
      return {
        ...post,
        user: post.author,
        // Lazy-loaded comment stubs — content/userId are empty; full data fetched on expand
        comments: post.comments.map((c) => ({
          id: c.id,
          content: "",
          createdAt: post.createdAt, // dummy
          status: c.status,
          userId: { id: "", name: "", avatar: null },
        })),
        reactions: (summary?.top ?? []).map((r) => ({ id: r.id, emoji: r.emoji, userId: r.userId })),
        reactionSummary: summary ? { total: summary.total, byEmoji: summary.byEmoji } : undefined,
      };
    });

    return { success: true, posts: mapped };
  } catch (error) {
    console.error("getPinnedPostsAction error:", error);
    return { error: "Failed to fetch pinned posts" };
  }
}

export async function getPinnedPreviewAction() {
  try {
    // Lightweight query for the home page entry card: only needs the first post's
    // content, author name and a few image thumbnails — no comments/reactions payloads.
    const currentUser = await getSessionUser();
    const isAdmin = currentUser && (currentUser.role === "super_admin" || currentUser.role === "admin");
    const pinnedPosts = await db.query.posts.findMany({
      where: isAdmin
        ? isNotNull(posts.pinnedAt)
        : and(eq(posts.status, "approved"), isNotNull(posts.pinnedAt)),
      orderBy: [asc(posts.pinnedAt)],
      limit: MAX_PINNED,
      columns: {
        id: true,
        userId: true,
        content: true,
        mediaUrls: true,
        ytVideoId: true,
        embedType: true,
        embedId: true,
        embedMeta: true,
        status: true,
        pinnedAt: true,
        createdAt: true,
      },
      with: {
        author: {
          columns: { id: true, name: true, avatar: true, role: true, slug: true },
        },
      },
    });

    const mapped = pinnedPosts.map((post) => ({
      ...post,
      user: post.author,
      comments: [],
      reactions: [],
    }));

    return { success: true, posts: mapped };
  } catch (error) {
    console.error("getPinnedPreviewAction error:", error);
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
      },
    });

    const sorted = postIds
      .map((id) => pinnedPosts.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p);

    const reactionsMap = await loadReactions(sorted.map((p) => p.id));

    const mapped = sorted.map((post) => {
      const summary = reactionsMap.get(post.id);
      return {
        ...post,
        user: post.author,
        // Lazy-loaded comment stubs — content/userId are empty; full data fetched on expand
        comments: post.comments.map((c) => ({
          id: c.id,
          content: "",
          createdAt: post.createdAt,
          status: c.status,
          userId: { id: "", name: "", avatar: null },
        })),
        reactions: (summary?.top ?? []).map((r) => ({ id: r.id, emoji: r.emoji, userId: r.userId })),
        reactionSummary: summary ? { total: summary.total, byEmoji: summary.byEmoji } : undefined,
      };
    });

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

    const cursorCond = cursor ? parseCursor(cursor) : null;
    const userPosts = await db.query.posts.findMany({
      where: isAdmin
        ? and(
            eq(posts.userId, target.id),
            isNull(posts.pinnedAt),
            cursorCond ? or(lt(posts.createdAt, cursorCond.createdAt), and(eq(posts.createdAt, cursorCond.createdAt), lt(posts.id, cursorCond.id))) : undefined
          )
        : and(
            eq(posts.userId, target.id),
            eq(posts.status, "approved"),
            isNull(posts.pinnedAt),
            cursorCond ? or(lt(posts.createdAt, cursorCond.createdAt), and(eq(posts.createdAt, cursorCond.createdAt), lt(posts.id, cursorCond.id))) : undefined
          ),
      orderBy: [desc(posts.createdAt), desc(posts.id)],
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
      },
    });

    const hasMore = userPosts.length > PAGE_SIZE;
    const items = hasMore ? userPosts.slice(0, PAGE_SIZE) : userPosts;
    const nextCursor = hasMore && items.length > 0
      ? makeCursor(items[items.length - 1])
      : null;

    const reactionsMap = await loadReactions(items.map((p) => p.id));

    const mapped = items.map((post) => {
      const summary = reactionsMap.get(post.id);
      return {
        ...post,
        user: post.author,
        // Lazy-loaded comment stubs — content/userId are empty; full data fetched on expand
        comments: post.comments.map((c) => ({
          id: c.id,
          content: "",
          createdAt: post.createdAt,
          status: c.status,
          userId: { id: "", name: "", avatar: null },
        })),
        reactions: (summary?.top ?? []).map((r) => ({ id: r.id, emoji: r.emoji, userId: r.userId })),
        reactionSummary: summary ? { total: summary.total, byEmoji: summary.byEmoji } : undefined,
      };
    });

    return { success: true, posts: mapped, nextCursor, hasMore };
  } catch (error) {
    console.error("getUserPostsAction error:", error);
    return { error: "Failed to fetch user posts" };
  }
}

import { cache } from "react";

export const getSuperAdminProfileAction = cache(async function getSuperAdminProfileAction() {
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
});

export async function addCommentAction(postId: string, content: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };
  if (user.status === "suspended") return { error: "Your account is suspended" };
  if (!content.trim()) return { error: "Comment content cannot be empty" };
  if (content.length > 500) return { error: "评论内容不能超过 500 字" };

  if (!INTERACTION_RATE_LIMITER.allow(user.id)) {
    return { error: "操作过于频繁，请稍后再试" };
  }

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

  if (!INTERACTION_RATE_LIMITER.allow(user.id)) {
    return { error: "操作过于频繁，请稍后再试" };
  }

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

    const summary = (await loadReactions([post.id])).get(post.id);

    const mapped = {
      ...post,
      user: post.author,
      comments: post.comments.map((c) => ({ ...c, userId: c.author })),
      reactions: (summary?.top ?? []).map((r) => ({ id: r.id, emoji: r.emoji, userId: r.userId })),
      reactionSummary: summary ? { total: summary.total, byEmoji: summary.byEmoji } : undefined,
    };

    return { success: true, post: mapped };
  } catch (error) {
    console.error("getPostByIdAction error:", error);
    return { error: "Failed to fetch post details" };
  }
}

export async function checkCustomDomainAvailabilityAction() {
  try {
    const allowed = (await getSetting("allow_custom_domains")) === "true";
    return { success: true, allowed };
  } catch (error) {
    console.error("checkCustomDomainAvailabilityAction error:", error);
    return { success: false, allowed: false };
  }
}

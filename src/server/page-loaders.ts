import { getCachedPublicFeed, getCachedSuperAdminProfile } from "@/lib/feed-cache";
import { getSiteFcProfile } from "@/lib/settings";
import { SITE_PROFILE_PLACEHOLDER, type HomeHeaderProfile } from "@/lib/site-profile";
import {
  getPinnedPreviewAction,
  getUserBySlugAction,
  getUserPostsAction,
  getUserPinnedPostsAction,
  getPostByIdAction,
  getFriendsCircleAction,
  getPinnedPostsAction,
  getPostsByTagAction,
  getSuperAdminProfileAction,
} from "@/app/actions/posts";
import { getPublicSettingsAction } from "@/app/actions/admin";
import { getSessionUser } from "@/lib/auth";
import { plainExcerpt } from "@/lib/plain-text";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { PostData } from "@/components/timeline-shell";

export interface PageMetadata {
  title: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
  twitterCard?: string;
  jsonLd?: Record<string, unknown> | null;
}

export interface PageLoadResult {
  initialData: Record<string, unknown>;
  metadata: PageMetadata;
  redirectUrl?: string;
}

async function resolveHomeProfile(): Promise<HomeHeaderProfile> {
  const [fc, superAdmin] = await Promise.all([
    getSiteFcProfile(),
    getCachedSuperAdminProfile(),
  ]);
  return {
    name: fc.title || superAdmin?.name || SITE_PROFILE_PLACEHOLDER,
    slug: null,
    avatar: fc.logo || superAdmin?.avatar || null,
    bio: fc.desc || superAdmin?.bio || null,
    coverImage: fc.cover || superAdmin?.coverImage || null,
  };
}

export async function loadHomePage(): Promise<PageLoadResult> {
  const [profile, postsRes, pinnedRes, settingsRes] = await Promise.all([
    resolveHomeProfile(),
    getCachedPublicFeed(),
    getPinnedPreviewAction(),
    getPublicSettingsAction(),
  ]);

  const initialPosts = (postsRes.posts as PostData[] | undefined) ?? [];
  const initialHasMore = postsRes.hasMore ?? false;
  const initialNextCursor = postsRes.nextCursor ?? null;
  const initialPinnedPosts = (pinnedRes.posts as PostData[] | undefined) ?? [];
  const initialSettings = settingsRes.settings ?? {};

  return {
    initialData: {
      initialProfile: profile,
      initialPosts,
      initialHasMore,
      initialNextCursor,
      initialPinnedPosts,
      initialSettings,
    },
    metadata: {
      title: profile.name,
      description: profile.bio || `${profile.name} · Jotify Moment`,
      ogTitle: profile.name,
      ogDescription: profile.bio || `${profile.name} · Jotify Moment`,
      ogImage: profile.avatar || profile.coverImage || "/default-cover.jpg",
      canonical: "/",
    },
  };
}

export async function loadUserHomePage(slug: string, reqHeaders?: Headers): Promise<PageLoadResult> {
  const [res, pinnedRes, postsRes] = await Promise.all([
    getUserBySlugAction(slug),
    getUserPinnedPostsAction(slug),
    getUserPostsAction(slug),
  ]);

  const user = "user" in res && res.user ? res.user : null;
  const initialPinnedPosts = pinnedRes.posts
    ? (pinnedRes.posts.map((p) => ({ ...p, user: (p as Record<string, unknown>).author })) as PostData[])
    : [];
  const initialPosts = "posts" in postsRes && postsRes.posts ? (postsRes.posts as PostData[]) : [];
  const initialHasMore = "hasMore" in postsRes ? postsRes.hasMore ?? false : false;
  const initialNextCursor = "nextCursor" in postsRes ? postsRes.nextCursor ?? null : null;

  let description = user?.bio || "";
  if (user) {
    const latest = await db.query.posts.findFirst({
      where: and(eq(posts.userId, user.id), eq(posts.status, "approved")),
      orderBy: [desc(posts.createdAt)],
      columns: { content: true },
    });
    if (latest?.content) {
      const excerpt = plainExcerpt(latest.content);
      description = (description ? description + " " : "") + excerpt;
    }
  }

  const isCustomDomain = reqHeaders?.get("x-custom-domain") === "true";
  const customDomainSlug = reqHeaders?.get("x-custom-domain-slug") || (isCustomDomain ? slug : undefined);
  const mainHost = process.env.MAIN_HOST?.split(",")[0]?.trim() || "localhost:3000";
  const host = (reqHeaders?.get("x-forwarded-host") || reqHeaders?.get("host") || "").split(",")[0].trim();
  const proto = reqHeaders?.get("x-forwarded-proto") === "https" ? "https" : "http";

  // 当在主域名访问已配置自定义域名的用户主页时，自动 302 重定向到其自定义域名
  if (!isCustomDomain && user?.customDomain && user.allowCustomDomain && user.customDomainStatus === "approved") {
    return {
      initialData: {},
      metadata: { title: user.name },
      redirectUrl: `https://${user.customDomain}/`,
    };
  }

  let canonical: string;
  if (isCustomDomain) {
    canonical = `${proto}://${host}/`;
  } else if (user?.customDomain && user.allowCustomDomain && user.customDomainStatus === "approved") {
    canonical = `https://${user.customDomain}/`;
  } else {
    canonical = `/u/${encodeURIComponent(slug)}`;
  }

  return {
    initialData: {
      slug,
      isCustomDomain,
      customDomainSlug,
      mainHost,
      initialUser: user,
      initialPinnedPosts,
      initialPosts,
      initialHasMore,
      initialNextCursor,
      initialNotFound: !user,
    },
    metadata: {
      title: user ? user.name : "用户主页",
      description: description || (user ? `${user.name} 的个人主页` : "用户主页"),
      ogTitle: user ? user.name : "用户主页",
      ogDescription: description || (user ? `${user.name} 的个人主页` : "用户主页"),
      ogImage: user?.avatar || user?.coverImage || "/default-cover.jpg",
      canonical,
    },
  };
}

export async function loadMomentPage(id: string, reqHeaders?: Headers): Promise<PageLoadResult> {
  const res = await getPostByIdAction(id);
  const post = "post" in res && res.post ? res.post : null;

  let title = "Moment 详情";
  let excerpt = "查看 Moment 详情";
  let firstImage: string | undefined;
  let jsonLd: Record<string, unknown> | null = null;

  if (post) {
    title = `${post.user.name} 的 Moment`;
    excerpt = plainExcerpt(post.content) || "查看 Moment 详情";
    const mediaUrls = post.mediaUrls as Array<{ type: string; url: string }> | undefined;
    firstImage = mediaUrls?.find((m) => m.type === "image")?.url;
    const images = mediaUrls?.filter((m) => m.type === "image").map((m) => m.url) || [];
    jsonLd = {
      "@context": "https://schema.org",
      "@type": "SocialMediaPosting",
      headline: plainExcerpt(post.content, 50),
      articleBody: post.content,
      datePublished: post.createdAt,
      author: {
        "@type": "Person",
        name: post.user?.name,
        image: post.user?.avatar,
      },
      image: images.length > 0 ? images : undefined,
    };
  }

  const isCustomDomain = reqHeaders?.get("x-custom-domain") === "true";
  const customDomainSlug = reqHeaders?.get("x-custom-domain-slug") || undefined;
  const mainHost = process.env.MAIN_HOST?.split(",")[0]?.trim() || "localhost:3000";
  const host = (reqHeaders?.get("x-forwarded-host") || reqHeaders?.get("host") || "").split(",")[0].trim();
  const proto = reqHeaders?.get("x-forwarded-proto") === "https" ? "https" : "http";
  const author = post?.user as { customDomain?: string | null; allowCustomDomain?: boolean; customDomainStatus?: string | null } | undefined;
  const authorCustomDomain =
    author?.customDomain && author.allowCustomDomain && author.customDomainStatus === "approved" ? author.customDomain : null;

  let canonical: string;
  if (isCustomDomain) {
    canonical = `${proto}://${host}/mo/${id}`;
  } else if (authorCustomDomain) {
    canonical = `https://${authorCustomDomain}/mo/${id}`;
  } else {
    canonical = `/mo/${id}`;
  }

  return {
    initialData: {
      id,
      isCustomDomain,
      customDomainSlug,
      mainHost,
      initialPost: post,
      initialError: post ? null : "日志不存在或已被删除",
    },
    metadata: {
      title,
      description: excerpt,
      ogTitle: title,
      ogDescription: excerpt,
      ogImage: firstImage || "/default-og.png",
      canonical,
      twitterCard: firstImage ? "summary_large_image" : "summary",
      jsonLd,
    },
  };
}

export async function loadFriendsPage(): Promise<PageLoadResult> {
  const [siteProfile, friendsRes, superAdmin] = await Promise.all([
    getSiteFcProfile(),
    getFriendsCircleAction(),
    getCachedSuperAdminProfile(),
  ]);

  const initialFriends = "users" in friendsRes && friendsRes.users ? friendsRes.users : [];
  const initialEffectiveProfile: HomeHeaderProfile = {
    name: siteProfile.title || superAdmin?.name || "朋友圈",
    slug: null,
    avatar: siteProfile.logo || superAdmin?.avatar || null,
    bio: siteProfile.desc || superAdmin?.bio || null,
    coverImage: siteProfile.cover || superAdmin?.coverImage || null,
  };

  return {
    initialData: {
      initialSiteProfile: siteProfile,
      initialEffectiveProfile,
      initialFriends,
    },
    metadata: {
      title: "好友圈",
      description: "浏览平台的所有好友",
      ogTitle: "好友圈",
      ogDescription: "浏览平台的所有好友",
      canonical: "/friends",
    },
  };
}

export async function loadPinnedPage(): Promise<PageLoadResult> {
  const [adminRes, pinnedRes] = await Promise.all([
    getSuperAdminProfileAction(),
    getPinnedPostsAction(),
  ]);

  const initialSuperAdmin = "user" in adminRes && adminRes.user ? adminRes.user : null;
  const initialPinnedPosts = "posts" in pinnedRes && pinnedRes.posts ? (pinnedRes.posts as PostData[]) : [];

  return {
    initialData: {
      initialSuperAdmin,
      initialPinnedPosts,
    },
    metadata: {
      title: "置顶动态",
      description: "查看站点的置顶精选动态",
      ogTitle: "置顶动态",
      ogDescription: "查看站点的置顶精选动态",
      canonical: "/pinned",
    },
  };
}

export async function loadTagPage(tag: string): Promise<PageLoadResult> {
  const decodedTag = decodeURIComponent(tag);
  const [fc, superAdmin, tagRes] = await Promise.all([
    getSiteFcProfile(),
    getCachedSuperAdminProfile(),
    getPostsByTagAction(decodedTag),
  ]);

  const profile: HomeHeaderProfile = {
    name: `#${decodedTag}`,
    slug: null,
    avatar: fc.logo || superAdmin?.avatar || null,
    bio: fc.desc ? `话题 #${decodedTag} · ${fc.desc}` : `包含 #${decodedTag} 的所有动态`,
    coverImage: fc.cover || superAdmin?.coverImage || null,
  };

  const initialPosts = "posts" in tagRes && tagRes.posts ? (tagRes.posts as PostData[]) : [];
  const initialHasMore = "hasMore" in tagRes ? tagRes.hasMore ?? false : false;
  const initialNextCursor = "nextCursor" in tagRes ? tagRes.nextCursor ?? null : null;

  return {
    initialData: {
      tag: decodedTag,
      initialProfile: profile,
      initialPosts,
      initialHasMore,
      initialNextCursor,
    },
    metadata: {
      title: `#${decodedTag} - 话题动态`,
      description: `查看包含 #${decodedTag} 话题的所有公开 Moment 动态。`,
      ogTitle: `#${decodedTag} - 话题动态`,
      ogDescription: `查看包含 #${decodedTag} 话题的所有公开 Moment 动态。`,
      canonical: `/tag/${encodeURIComponent(decodedTag)}`,
    },
  };
}

export async function loadSettingsPage(): Promise<PageLoadResult> {
  const currentUser = await getSessionUser();
  if (!currentUser) {
    return {
      initialData: {},
      metadata: { title: "个人设置" },
      redirectUrl: "/",
    };
  }

  return {
    initialData: { currentUser },
    metadata: {
      title: "个人设置",
      description: "管理个人资料、隐私与 API 密钥",
      canonical: "/settings",
    },
  };
}

export async function loadAdminPage(): Promise<PageLoadResult> {
  const currentUser = await getSessionUser();
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "admin")) {
    return {
      initialData: {},
      metadata: { title: "系统控制台" },
      redirectUrl: "/",
    };
  }

  return {
    initialData: { currentUser },
    metadata: {
      title: "系统控制台 - Moment",
      description: "系统设置、待审核发布与用户管理",
      canonical: "/admin",
    },
  };
}

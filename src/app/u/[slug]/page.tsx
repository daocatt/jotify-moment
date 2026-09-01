import type { Metadata } from "next";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getUserBySlugAction } from "@/app/actions/posts";
import { UserHomeClient } from "./user-home-client";

export const dynamic = "force-dynamic";

function plainExcerpt(content: string, max = 80): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*`>_~]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? plain.slice(0, max) + "…" : plain;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const res = await getUserBySlugAction(slug);
  if (!("user" in res) || !res.user) return {};

  const user = res.user;
  let description = user.bio || "";

  const latest = await db.query.posts.findFirst({
    where: and(eq(posts.userId, user.id), eq(posts.status, "approved")),
    orderBy: [desc(posts.createdAt)],
    columns: { content: true },
  });
  if (latest?.content) {
    const excerpt = plainExcerpt(latest.content);
    description = (description ? description + " " : "") + excerpt;
  }

  const hdrs = await headers();
  const isCustomDomain = hdrs.get("x-custom-domain") === "true";
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "";
  const proto = hdrs.get("x-forwarded-proto") === "https" ? "https" : "http";

  // Canonical strategy: the custom domain is the authoritative origin.
  //  - Served on a custom domain → canonical to that domain's root.
  //  - Served on the main host but user owns a custom domain → canonical there
  //    (avoids duplicate content between main-host /u/{slug} and the domain).
  //  - Otherwise → keep the main-host /u/{slug} path.
  let canonical: string;
  if (isCustomDomain) {
    canonical = `${proto}://${host}/`;
  } else if (user.customDomain && user.allowCustomDomain) {
    canonical = `https://${user.customDomain}/`;
  } else {
    canonical = `/u/${encodeURIComponent(slug)}`;
  }

  return {
    title: user.name,
    description: description || `${user.name} 的个人主页`,
    alternates: { canonical },
    openGraph: {
      title: user.name,
      description: description || `${user.name} 的个人主页`,
      type: "profile",
      images: user.avatar ? [{ url: user.avatar }] : undefined,
      url: canonical,
    },
    twitter: {
      card: "summary",
      title: user.name,
      description: description || `${user.name} 的个人主页`,
      images: user.avatar ? [user.avatar] : undefined,
    },
  };
}

import { headers } from "next/headers";
import { getUserPostsAction, getUserPinnedPostsAction } from "@/app/actions/posts";
import type { PostData } from "@/components/timeline-shell";

export default async function UserHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [userRes, pinnedRes, postsRes, headersList] = await Promise.all([
    getUserBySlugAction(slug),
    getUserPinnedPostsAction(slug),
    getUserPostsAction(slug),
    headers(),
  ]);

  const isCustomDomain = headersList.get("x-custom-domain") === "true";
  const mainHost = process.env.MAIN_HOST?.split(",")[0] || "localhost:3000";

  const initialUser = "user" in userRes && userRes.user ? (userRes.user as any) : null;
  const initialPinnedPosts =
    "posts" in pinnedRes && pinnedRes.posts
      ? (pinnedRes.posts.map((p) => ({ ...p, user: (p as Record<string, unknown>).author })) as PostData[])
      : [];
  const initialPosts = "posts" in postsRes && postsRes.posts ? (postsRes.posts as PostData[]) : [];
  const initialHasMore = "hasMore" in postsRes && typeof postsRes.hasMore === "boolean" ? postsRes.hasMore : false;
  const initialNextCursor = "nextCursor" in postsRes && typeof postsRes.nextCursor === "string" ? postsRes.nextCursor : null;
  const initialNotFound = !initialUser;

  return (
    <UserHomeClient
      slug={slug}
      isCustomDomain={isCustomDomain}
      mainHost={mainHost}
      initialUser={initialUser}
      initialPinnedPosts={initialPinnedPosts}
      initialPosts={initialPosts}
      initialHasMore={initialHasMore}
      initialNextCursor={initialNextCursor}
      initialNotFound={initialNotFound}
    />
  );
}
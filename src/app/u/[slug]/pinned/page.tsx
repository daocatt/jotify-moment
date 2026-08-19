import type { Metadata } from "next";
import { headers } from "next/headers";
import { getUserPinnedPostsAction, getUserBySlugAction } from "@/app/actions/posts";
import type { PostData } from "@/components/timeline-shell";
import { UserPinnedClient } from "./user-pinned-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const res = await getUserBySlugAction(slug);
  if (!("user" in res) || !res.user) return {};

  return {
    title: `${res.user.name} 的置顶动态`,
    description: res.user.bio || `${res.user.name} 的置顶动态精选`,
  };
}

export default async function UserPinnedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [userRes, pinnedRes, headersList] = await Promise.all([
    getUserBySlugAction(slug),
    getUserPinnedPostsAction(slug),
    headers(),
  ]);

  const isCustomDomain = headersList.get("x-custom-domain") === "true";
  const mainHost = process.env.MAIN_HOST?.split(",")[0] || "localhost:3000";

  const initialUser = "user" in userRes && userRes.user ? (userRes.user as any) : null;
  const initialPinnedPosts =
    "posts" in pinnedRes && pinnedRes.posts
      ? (pinnedRes.posts.map((p) => ({ ...p, user: (p as Record<string, unknown>).author })) as PostData[])
      : [];

  return (
    <UserPinnedClient
      slug={slug}
      isCustomDomain={isCustomDomain}
      mainHost={mainHost}
      initialUser={initialUser}
      initialPinnedPosts={initialPinnedPosts}
    />
  );
}

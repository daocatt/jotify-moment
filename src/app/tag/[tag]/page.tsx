import type { Metadata } from "next";
import { getSiteFcProfile } from "@/lib/settings";
import { SITE_PROFILE_PLACEHOLDER, type HomeHeaderProfile } from "@/lib/site-profile";
import { getPostsByTagAction } from "@/app/actions/posts";
import { TagClient } from "./tag-client";
import type { PostData } from "@/components/timeline-shell";

export const dynamic = "force-dynamic";

async function resolveTagHeaderProfile(tag: string): Promise<HomeHeaderProfile> {
  const fc = await getSiteFcProfile();
  return {
    name: `#${tag}`,
    slug: null,
    avatar: fc.logo || null,
    bio: fc.desc ? `话题 #${tag} · ${fc.desc}` : `包含 #${tag} 的所有动态`,
    coverImage: fc.cover || null,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);

  return {
    title: `#${decodedTag} - 话题动态`,
    description: `查看包含 #${decodedTag} 话题的所有公开 Moment 动态。`,
    alternates: {
      canonical: `/tag/${encodeURIComponent(decodedTag)}`,
    },
  };
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);

  const [profile, tagRes] = await Promise.all([
    resolveTagHeaderProfile(decodedTag),
    getPostsByTagAction(decodedTag),
  ]);

  const initialPosts = (tagRes.posts as PostData[] | undefined) ?? [];
  const initialHasMore = tagRes.hasMore ?? false;
  const initialNextCursor = tagRes.nextCursor ?? null;

  return (
    <TagClient
      tag={decodedTag}
      initialProfile={profile}
      initialPosts={initialPosts}
      initialHasMore={initialHasMore}
      initialNextCursor={initialNextCursor}
    />
  );
}

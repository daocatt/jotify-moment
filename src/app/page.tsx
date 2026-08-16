import type { Metadata } from "next";
import { getCachedPublicFeed } from "@/lib/feed-cache";
import { getSiteFcProfile } from "@/lib/settings";
import { SITE_PROFILE_PLACEHOLDER, type HomeHeaderProfile } from "@/lib/site-profile";
import { HomeClient } from "./home-client";
import type { PostData } from "@/components/timeline-shell";

export const dynamic = "force-dynamic";

/**
 * The homepage header is ALWAYS the GLOBAL site (friends-circle) basic profile —
 * strictly separate from the admin's personal profile. When the profile is not
 * filled in yet, the name slot shows "请完善信息->" (no admin fallback).
 */
async function resolveHomeProfile(): Promise<HomeHeaderProfile> {
  const fc = await getSiteFcProfile();
  return {
    name: fc.title || SITE_PROFILE_PLACEHOLDER,
    slug: null,
    avatar: fc.logo || null,
    bio: fc.desc || null,
    coverImage: fc.cover || null,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const profile = await resolveHomeProfile();
  return {
    title: profile.name,
    description: profile.bio || `${profile.name} · Jotify Moment`,
  };
}

export default async function Home() {
  const [profile, postsRes] = await Promise.all([
    resolveHomeProfile(),
    getCachedPublicFeed(),
  ]);

  const initialPosts = (postsRes.posts as PostData[] | undefined) ?? [];
  const initialHasMore = postsRes.hasMore ?? false;
  const initialNextCursor = postsRes.nextCursor ?? null;

  return (
    <HomeClient
      initialProfile={profile}
      initialPosts={initialPosts}
      initialHasMore={initialHasMore}
      initialNextCursor={initialNextCursor}
    />
  );
}

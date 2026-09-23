import type { Metadata } from "next";
import { getCachedPublicFeed } from "@/lib/feed-cache";
import { getSiteFcProfile } from "@/lib/settings";
import { SITE_PROFILE_PLACEHOLDER, type HomeHeaderProfile } from "@/lib/site-profile";
import { HomeClient } from "./home-client";
import type { PostData } from "@/components/timeline-shell";
import { getPinnedPreviewAction } from "@/app/actions/posts";
import { getPublicSettingsAction } from "@/app/actions/admin";

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
    alternates: {
      canonical: "/",
    },
  };
}

export default async function Home() {
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

  const coverUrl = profile.coverImage || "/default-cover.jpg";

  return (
    <>
      <link rel="preload" as="image" href={coverUrl} fetchPriority="high" />
      <HomeClient
        initialProfile={profile}
        initialPosts={initialPosts}
        initialHasMore={initialHasMore}
        initialNextCursor={initialNextCursor}
        initialPinnedPosts={initialPinnedPosts}
        initialSettings={initialSettings}
      />
    </>
  );
}

import type { Metadata } from "next";
import { getCachedPublicFeed, getCachedSuperAdminProfile } from "@/lib/feed-cache";
import { getSiteFcProfile } from "@/lib/settings";
import { SITE_PROFILE_PLACEHOLDER, type HomeHeaderProfile } from "@/lib/site-profile";
import { HomeClient } from "./home-client";
import type { PostData } from "@/components/timeline-shell";
import { getPinnedPreviewAction } from "@/app/actions/posts";
import { getPublicSettingsAction } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

/**
 * The homepage header displays the global site (friends-circle) profile when configured;
 * otherwise it gracefully falls back to the super admin's profile so the site's default
 * public homepage always has an avatar and identity.
 */
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
      {profile.avatar && (
        <link rel="preload" as="image" href={profile.avatar} fetchPriority="high" />
      )}
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

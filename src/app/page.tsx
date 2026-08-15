import type { Metadata } from "next";
import { getSuperAdminProfileAction } from "@/app/actions/posts";
import { getCachedPublicFeed } from "@/lib/feed-cache";
import { getSetting, getSiteFcProfile } from "@/lib/settings";
import { HomeClient } from "./home-client";
import type { PostData } from "@/components/timeline-shell";

export const dynamic = "force-dynamic";

export interface HomeHeaderProfile {
  id?: string;
  name: string;
  slug: string | null;
  avatar: string | null;
  bio: string | null;
  coverImage: string | null;
}

/**
 * The homepage header is the GLOBAL friends-circle (site) profile when the
 * feature is enabled; otherwise it falls back to the current home (admin's
 * personal profile). The two are strictly separate data.
 */
async function resolveHomeProfile(): Promise<{ profile: HomeHeaderProfile; isSiteHome: boolean }> {
  const friendsCircleEnabled = (await getSetting("friends_circle_enabled")) === "true";

  if (friendsCircleEnabled) {
    const fc = await getSiteFcProfile();
    return {
      isSiteHome: true,
      profile: {
        name: fc.title || "朋友圈",
        slug: null,
        avatar: fc.logo || null,
        bio: fc.desc || null,
        coverImage: fc.cover || null,
      },
    };
  }

  const res = await getSuperAdminProfileAction();
  const user = "user" in res && res.user ? res.user : null;
  return {
    isSiteHome: false,
    profile: user ?? { name: "首页", slug: null, avatar: null, bio: null, coverImage: null },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await resolveHomeProfile();
  return {
    title: profile.name,
    description: profile.bio || `${profile.name} · Jotify Moment`,
  };
}

export default async function Home() {
  const [{ profile, isSiteHome }, postsRes] = await Promise.all([
    resolveHomeProfile(),
    getCachedPublicFeed(),
  ]);

  const initialPosts = (postsRes.posts as PostData[] | undefined) ?? [];
  const initialHasMore = postsRes.hasMore ?? false;
  const initialNextCursor = postsRes.nextCursor ?? null;

  return (
    <HomeClient
      initialProfile={profile}
      isSiteHome={isSiteHome}
      initialPosts={initialPosts}
      initialHasMore={initialHasMore}
      initialNextCursor={initialNextCursor}
    />
  );
}

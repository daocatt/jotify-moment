import type { Metadata } from "next";
import { getSiteFcProfile } from "@/lib/settings";
import { getCachedSuperAdminProfile } from "@/lib/feed-cache";
import { type HomeHeaderProfile } from "@/lib/site-profile";
import { getFriendsCircleAction } from "@/app/actions/posts";
import { FriendsClient } from "./friends-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "好友圈",
  description: "浏览平台的所有好友",
};

export default async function FriendsPage() {
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

  return (
    <FriendsClient
      initialSiteProfile={siteProfile}
      initialEffectiveProfile={initialEffectiveProfile}
      initialFriends={initialFriends}
    />
  );
}

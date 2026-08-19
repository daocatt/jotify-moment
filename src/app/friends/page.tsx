import type { Metadata } from "next";
import { getSiteFcProfile } from "@/lib/settings";
import { getFriendsCircleAction } from "@/app/actions/posts";
import { FriendsClient } from "./friends-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "好友圈",
  description: "浏览平台的所有好友",
};

export default async function FriendsPage() {
  const [siteProfile, friendsRes] = await Promise.all([
    getSiteFcProfile(),
    getFriendsCircleAction(),
  ]);

  const initialFriends = "users" in friendsRes && friendsRes.users ? (friendsRes.users as any) : [];

  return (
    <FriendsClient
      initialSiteProfile={siteProfile}
      initialFriends={initialFriends}
    />
  );
}

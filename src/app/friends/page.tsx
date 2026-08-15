import type { Metadata } from "next";
import { FriendsClient } from "./friends-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "好友圈",
  description: "浏览平台的所有好友",
};

export default function FriendsPage() {
  return <FriendsClient />;
}

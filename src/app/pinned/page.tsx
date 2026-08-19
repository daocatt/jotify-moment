import type { Metadata } from "next";
import { getPinnedPostsAction, getSuperAdminProfileAction } from "@/app/actions/posts";
import type { PostData } from "@/components/timeline-shell";
import { PinnedClient } from "./pinned-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "置顶动态",
  description: "查看站点的置顶精选动态",
};

export default async function PinnedPage() {
  const [adminRes, pinnedRes] = await Promise.all([
    getSuperAdminProfileAction(),
    getPinnedPostsAction(),
  ]);

  const initialSuperAdmin = "user" in adminRes && adminRes.user ? (adminRes.user as any) : null;
  const initialPinnedPosts = "posts" in pinnedRes && pinnedRes.posts ? (pinnedRes.posts as PostData[]) : [];

  return (
    <PinnedClient
      initialSuperAdmin={initialSuperAdmin}
      initialPinnedPosts={initialPinnedPosts}
    />
  );
}
import type { Metadata } from "next";
import { getSuperAdminProfileAction } from "@/app/actions/posts";
import { getPostsQuery } from "@/db/queries";
import { HomeClient } from "./home-client";
import type { PostData } from "@/components/timeline-shell";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const res = await getSuperAdminProfileAction();
  if ("user" in res && res.user) {
    return {
      title: res.user.name,
      description: res.user.bio || `${res.user.name} 的个人主页`,
    };
  }
  return {};
}

export default async function Home() {
  const [profileRes, postsRes] = await Promise.all([
    getSuperAdminProfileAction(),
    getPostsQuery(false), // Direct query call, not via Server Action
  ]);
  const superAdmin = "user" in profileRes && profileRes.user ? profileRes.user : null;
  const initialPosts = (postsRes.posts as PostData[] | undefined) ?? [];
  const initialHasMore = postsRes.hasMore ?? false;
  const initialNextCursor = postsRes.nextCursor ?? null;
  return (
    <HomeClient
      initialSuperAdmin={superAdmin}
      initialPosts={initialPosts}
      initialHasMore={initialHasMore}
      initialNextCursor={initialNextCursor}
    />
  );
}
"use client";

import { useState, useCallback, useEffect } from "react";
import { TimelineShell, type PostData } from "@/components/timeline-shell";
import { getUserPinnedPostsAction, getUserBySlugAction } from "@/app/actions/posts";
import { toast } from "sonner";

export function UserPinnedClient({ slug, isCustomDomain = false, mainHost }: { slug: string; isCustomDomain?: boolean; mainHost?: string }) {
  const [profileUser, setProfileUser] = useState<{
    id: string; name: string; slug: string | null;
    avatar: string | null; bio: string | null; coverImage: string | null;
  } | null>(null);
  const [pinnedPosts, setPinnedPosts] = useState<PostData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [userRes, pinnedRes] = await Promise.all([
      getUserBySlugAction(slug),
      getUserPinnedPostsAction(slug),
    ]);
    if (userRes.user) setProfileUser(userRes.user as typeof profileUser);
    if (pinnedRes.posts) setPinnedPosts(pinnedRes.posts.map((p) => ({ ...p, user: (p as Record<string, unknown>).author })) as PostData[]);
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch in effect is standard pattern
    loadData();
  }, [loadData]);

  if (!profileUser) {
    return (
      <main className="flex-1 w-full max-w-xl mx-auto bg-card min-h-screen border-x border-border shadow-sm flex items-center justify-center sm:mt-6 sm:rounded-t-xl">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="size-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-xs">加载中...</span>
        </div>
      </main>
    );
  }

  return (
    <TimelineShell
      profileUser={profileUser}
      posts={pinnedPosts}
      loadingPosts={loading && pinnedPosts.length === 0}
      hasMore={false}
      loadingMore={false}
      onLoadMore={() => {}}
      onRefresh={loadData}
      onProfileUpdated={loadData}
      showBackButton
      showPostEditor="never"
      isCustomDomain={isCustomDomain}
      mainHost={mainHost}
      isUserHomePage
    />
  );
}

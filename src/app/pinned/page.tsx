"use client";

import { useState, useCallback, useEffect } from "react";
import { TimelineShell, type PostData } from "@/components/timeline-shell";
import { getPinnedPostsAction, getSuperAdminProfileAction } from "@/app/actions/posts";
import { toast } from "sonner";

export default function PinnedPage() {
  const [superAdmin, setSuperAdmin] = useState<{
    id: string; name: string; slug: string | null;
    avatar: string | null; bio: string | null; coverImage: string | null;
  } | null>(null);
  const [pinnedPosts, setPinnedPosts] = useState<PostData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [adminRes, pinnedRes] = await Promise.all([
      getSuperAdminProfileAction(),
      getPinnedPostsAction(),
    ]);
    if (adminRes.user) setSuperAdmin(adminRes.user as typeof superAdmin);
    if (pinnedRes.posts) setPinnedPosts(pinnedRes.posts as PostData[]);
    else if (pinnedRes.error) toast.error(pinnedRes.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  if (!superAdmin) {
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
      profileUser={superAdmin}
      posts={pinnedPosts}
      loadingPosts={loading && pinnedPosts.length === 0}
      hasMore={false}
      loadingMore={false}
      onLoadMore={() => {}}
      onRefresh={loadData}
      showBackButton
      showPostEditor="never"
    />
  );
}
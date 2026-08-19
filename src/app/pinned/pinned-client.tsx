"use client";

import { useState, useCallback, useEffect } from "react";
import { TimelineShell, type PostData } from "@/components/timeline-shell";
import { getPinnedPostsAction, getSuperAdminProfileAction } from "@/app/actions/posts";
import { toast } from "sonner";

interface SuperAdminProfile {
  id: string;
  name: string;
  slug: string | null;
  avatar: string | null;
  bio: string | null;
  coverImage: string | null;
}

interface PinnedClientProps {
  initialSuperAdmin?: SuperAdminProfile | null;
  initialPinnedPosts?: PostData[];
}

export function PinnedClient({
  initialSuperAdmin = null,
  initialPinnedPosts = [],
}: PinnedClientProps = {}) {
  const [superAdmin, setSuperAdmin] = useState<SuperAdminProfile | null>(initialSuperAdmin);
  const [pinnedPosts, setPinnedPosts] = useState<PostData[]>(initialPinnedPosts);
  const [loading, setLoading] = useState(!initialSuperAdmin);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [adminRes, pinnedRes] = await Promise.all([
      getSuperAdminProfileAction(),
      getPinnedPostsAction(),
    ]);
    if (adminRes.user) setSuperAdmin(adminRes.user as SuperAdminProfile);
    if (pinnedRes.posts) setPinnedPosts(pinnedRes.posts as PostData[]);
    else if (pinnedRes.error) toast.error(pinnedRes.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!initialSuperAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData();
    }
  }, [loadData, initialSuperAdmin]);

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
      onProfileUpdated={loadData}
      showBackButton
      showPostEditor="never"
    />
  );
}

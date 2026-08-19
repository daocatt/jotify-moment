"use client";

import { useState, useCallback, useEffect } from "react";
import { TimelineShell, type PostData } from "@/components/timeline-shell";
import { getUserPinnedPostsAction, getUserBySlugAction } from "@/app/actions/posts";

interface ProfileUserPinned {
  id: string;
  name: string;
  slug: string | null;
  avatar: string | null;
  bio: string | null;
  coverImage: string | null;
  hidden?: boolean;
}

interface UserPinnedClientProps {
  slug: string;
  isCustomDomain?: boolean;
  mainHost?: string;
  initialUser?: ProfileUserPinned | null;
  initialPinnedPosts?: PostData[];
}

export function UserPinnedClient({
  slug,
  isCustomDomain = false,
  mainHost,
  initialUser = null,
  initialPinnedPosts = [],
}: UserPinnedClientProps) {
  const [profileUser, setProfileUser] = useState<ProfileUserPinned | null>(initialUser);
  const [pinnedPosts, setPinnedPosts] = useState<PostData[]>(initialPinnedPosts);
  const [loading, setLoading] = useState(!initialUser);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [userRes, pinnedRes] = await Promise.all([
      getUserBySlugAction(slug),
      getUserPinnedPostsAction(slug),
    ]);
    if (userRes.user) setProfileUser(userRes.user as ProfileUserPinned);
    if (pinnedRes.posts) setPinnedPosts(pinnedRes.posts.map((p) => ({ ...p, user: (p as Record<string, unknown>).author })) as PostData[]);
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    if (!initialUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch in effect is standard pattern
      loadData();
    }
  }, [loadData, initialUser]);

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
      hidden={profileUser.hidden === true}
    />
  );
}

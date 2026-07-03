"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { TimelineShell, type PostData } from "@/components/timeline-shell";
import { getUserBySlugAction, getUserPostsAction } from "@/app/actions/posts";
import { toast } from "sonner";

interface ProfileUserFull {
  id: string;
  name: string;
  slug: string | null;
  avatar: string | null;
  bio: string | null;
  coverImage: string | null;
  role: string;
  status: string;
  wechat: string | null;
  telegram: string | null;
  github: string | null;
  x: string | null;
  otherLink: string | null;
  theme: string | null;
}

export function UserHomeClient({ slug, isCustomDomain = false, mainHost }: { slug: string; isCustomDomain?: boolean; mainHost?: string }) {
  const [profileUser, setProfileUser] = useState<ProfileUserFull | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [posts, setPosts] = useState<PostData[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchUser = useCallback(async () => {
    const res = await getUserBySlugAction(slug);
    if ("user" in res && res.user) {
      setProfileUser(res.user as ProfileUserFull);
    } else {
      setNotFound(true);
    }
  }, [slug]);

  const fetchPosts = useCallback(async (append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoadingPosts(true);
    }
    const res = await getUserPostsAction(slug, append ? cursorRef.current ?? undefined : undefined);
    setLoadingPosts(false);
    setLoadingMore(false);

    if ("posts" in res && res.posts) {
      const typedPosts = res.posts as PostData[];
      if (append) {
        setPosts((prev) => [...prev, ...typedPosts]);
      } else {
        setPosts(typedPosts);
      }
      cursorRef.current = res.nextCursor ?? null;
      setHasMore(res.hasMore ?? false);
    } else if ("error" in res) {
      toast.error(res.error);
    }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUser();
    fetchPosts();
  }, [fetchUser, fetchPosts]);

  const handleLoadMore = useCallback(() => {
    fetchPosts(true);
  }, [fetchPosts]);

  const handleRefresh = useCallback(() => {
    fetchUser();
    fetchPosts();
  }, [fetchUser, fetchPosts]);

  if (notFound) {
    return (
      <main className="flex-1 w-full max-w-xl mx-auto bg-card min-h-screen border-x border-border shadow-sm flex flex-col items-center justify-center gap-3 sm:mt-6 sm:rounded-t-xl">
        <p className="text-sm text-muted-foreground">该用户主页不存在</p>
        <Link href="/" className="text-xs text-primary hover:underline">返回首页</Link>
      </main>
    );
  }

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
      posts={posts}
      loadingPosts={loadingPosts}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={handleLoadMore}
      onRefresh={handleRefresh}
      onProfileUpdated={fetchUser}
      showBackButton={!isCustomDomain}
      showPostEditor="own"
      isCustomDomain={isCustomDomain}
      mainHost={mainHost}
      isUserHomePage
    />
  );
}
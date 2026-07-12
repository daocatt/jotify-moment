"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pin } from "lucide-react";
import { TimelineShell, type PostData } from "@/components/timeline-shell";
import { getUserBySlugAction, getUserPostsAction, getUserPinnedPostsAction } from "@/app/actions/posts";
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
  const router = useRouter();
  const [profileUser, setProfileUser] = useState<ProfileUserFull | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [posts, setPosts] = useState<PostData[]>([]);
  const [pinnedPosts, setPinnedPosts] = useState<PostData[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchUser = useCallback(async () => {
    const res = await getUserBySlugAction(slug);
    if ("user" in res && res.user) {
      setProfileUser(res.user as ProfileUserFull);
      const pinnedRes = await getUserPinnedPostsAction(slug);
      if (pinnedRes.posts) setPinnedPosts(pinnedRes.posts.map((p) => ({ ...p, user: (p as Record<string, unknown>).author })) as PostData[]);
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

  const pinnedImages: string[] = [];
  for (const p of pinnedPosts) {
    for (const m of p.mediaUrls) {
      if (m.type === "image" && pinnedImages.length < 3) {
        pinnedImages.push(m.thumbnailUrl || m.url);
      }
    }
  }

  const pinnedEntry = pinnedPosts.length > 0 ? (
    <div className="flex justify-center px-4 my-3">
      <button
        type="button"
        onClick={() => router.push(`/u/${slug}/pinned`)}
        className="inline-flex items-center gap-4 rounded-xl border border-primary/30 bg-white dark:bg-primary/5 hover:bg-yellow-50 dark:hover:bg-primary/10 transition-colors p-3 text-left max-w-[420px] w-full"
      >
        {pinnedImages.length > 0 ? (
          <div className="relative h-[54px] w-[120px] shrink-0">
            {pinnedImages.slice(0, 3).map((img, idx) => (
              <div
                key={idx}
                className="absolute top-0 size-[54px] rounded-lg overflow-hidden border-2 border-background"
                style={{ left: idx * 30, zIndex: 3 - idx }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center shrink-0 text-primary/60">
            <Pin size={21} className="fill-primary/40" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-foreground truncate font-normal leading-snug">
            {pinnedPosts[0].content || `${pinnedPosts[0].user.name} 的动态`}
          </p>
          <p className="text-[11px] text-muted-foreground font-normal mt-0.5">
            <Pin size={13} className="inline fill-primary/50 mr-0.5" />
            共 {pinnedPosts.length} 条置顶
          </p>
        </div>
      </button>
    </div>
  ) : null;

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
      pinnedEntry={pinnedEntry}
    />
  );
}
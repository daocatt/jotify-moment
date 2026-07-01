"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TimelineShell, type PostData } from "@/components/timeline-shell";
import { getPostsAction, getPinnedPostsAction, getSuperAdminProfileAction } from "@/app/actions/posts";
import { toast } from "sonner";
import { Pin } from "lucide-react";

interface SuperAdminProfile {
  id: string; name: string; slug: string | null;
  avatar: string | null; bio: string | null; coverImage: string | null;
  wechat: string | null; telegram: string | null; github: string | null; x: string | null; otherLink: string | null;
}

interface PinnedPreview {
  posts: PostData[];
}

export function HomeClient({ initialSuperAdmin }: { initialSuperAdmin: SuperAdminProfile | null }) {
  const router = useRouter();

  const [superAdmin, setSuperAdmin] = useState<SuperAdminProfile | null>(initialSuperAdmin);

  const [posts, setPosts] = useState<PostData[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const [pinned, setPinned] = useState<PinnedPreview | null>(null);

  const fetchSuperAdmin = useCallback(async () => {
    const res = await getSuperAdminProfileAction();
    if (res.user) setSuperAdmin(res.user as SuperAdminProfile);
  }, []);

  const fetchPosts = useCallback(async (append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoadingPosts(true);
    }
    const res = await getPostsAction(append ? cursorRef.current ?? undefined : undefined);
    setLoadingPosts(false);
    setLoadingMore(false);

    if (res.error) {
      toast.error(res.error);
    } else if (res.posts) {
      const typedPosts = res.posts as PostData[];
      if (append) {
        setPosts((prev) => [...prev, ...typedPosts]);
      } else {
        setPosts(typedPosts);
      }
      cursorRef.current = res.nextCursor ?? null;
      setHasMore(res.hasMore ?? false);
    }
  }, []);

  const fetchPinned = useCallback(async () => {
    const res = await getPinnedPostsAction();
    if (res.posts) {
      setPinned({ posts: res.posts as PostData[] });
    }
  }, []);

  const initData = useCallback(() => {
    fetchPosts();
    fetchPinned();
  }, [fetchPosts, fetchPinned]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initData();
  }, [initData]);

  const handleLoadMore = useCallback(() => {
    fetchPosts(true);
  }, [fetchPosts]);

  const handleRefresh = useCallback(() => {
    fetchPosts();
    fetchPinned();
  }, [fetchPosts, fetchPinned]);

  // Pinned entry: collect first 3 images across pinned posts for stacked thumbnails
  const pinnedImages: string[] = [];
  if (pinned) {
    for (const p of pinned.posts) {
      for (const m of p.mediaUrls) {
        if (m.type === "image" && pinnedImages.length < 3) {
          pinnedImages.push(m.thumbnailUrl || m.url);
        }
      }
    }
  }

  const pinnedEntry = pinned && pinned.posts.length > 0 ? (
    <div className="flex justify-center px-4 my-3">
      <button
        type="button"
        onClick={() => router.push("/pinned")}
        className="inline-flex items-center gap-4 rounded-xl border border-primary/30 bg-white dark:bg-primary/5 hover:bg-yellow-50 dark:hover:bg-primary/10 transition-colors p-3 text-left max-w-[420px] w-full"
      >
        {/* Images first */}
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
        {/* Text after */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-foreground truncate font-normal leading-snug">
            {pinned.posts[0].content || `${pinned.posts[0].user.name} 的动态`}
          </p>
          <p className="text-[11px] text-muted-foreground font-normal mt-0.5">
            <Pin size={13} className="inline fill-primary/50 mr-0.5" />
            共 {pinned.posts.length} 条
          </p>
        </div>
      </button>
    </div>
  ) : null;

  if (!superAdmin) {
    return (
      <main className="flex-1 w-full max-w-xl mx-auto bg-card min-h-screen border-x border-border shadow-sm flex items-center justify-center">
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
      posts={posts}
      loadingPosts={loadingPosts}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={handleLoadMore}
      onRefresh={handleRefresh}
      onProfileUpdated={fetchSuperAdmin}
      showPostEditor="always"
      pinnedEntry={pinnedEntry}
      onAvatarClick={() => superAdmin.slug && router.push(`/u/${superAdmin.slug}`)}
    />
  );
}
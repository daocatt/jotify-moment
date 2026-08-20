"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { TimelineShell, type PostData } from "@/components/timeline-shell";
import { getPostsByTagAction } from "@/app/actions/posts";
import { ArrowLeft, Hash } from "lucide-react";
import type { HomeHeaderProfile } from "@/lib/site-profile";

export function TagClient({
  tag,
  initialProfile,
  initialPosts = [],
  initialHasMore = false,
  initialNextCursor = null,
}: {
  tag: string;
  initialProfile: HomeHeaderProfile;
  initialPosts?: PostData[];
  initialHasMore?: boolean;
  initialNextCursor?: string | null;
}) {
  const [posts, setPosts] = useState<PostData[]>(initialPosts);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const cursorRef = useRef<string | null>(initialNextCursor);

  const fetchPosts = useCallback(async (append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoadingPosts(true);
    }
    const res = await getPostsByTagAction(tag, append ? cursorRef.current ?? undefined : undefined);
    setLoadingPosts(false);
    setLoadingMore(false);

    if (res.success && res.posts) {
      if (append) {
        setPosts((prev) => [...prev, ...(res.posts as PostData[])]);
      } else {
        setPosts(res.posts as PostData[]);
      }
      setHasMore(res.hasMore ?? false);
      cursorRef.current = res.nextCursor ?? null;
    }
  }, [tag]);

  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore) {
      fetchPosts(true);
    }
  }, [hasMore, loadingMore, fetchPosts]);

  return (
    <TimelineShell
      profileUser={initialProfile}
      posts={posts}
      loadingPosts={loadingPosts}
      loadingMore={loadingMore}
      hasMore={hasMore}
      onLoadMore={loadMore}
      onRefresh={() => fetchPosts(false)}
      showBackButton
      showPostEditor="never"
    />
  );
}

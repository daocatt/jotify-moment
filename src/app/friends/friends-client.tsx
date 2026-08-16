"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { TimelineShell } from "@/components/timeline-shell";
import { getFriendsCircleAction } from "@/app/actions/posts";
import { getSiteFcProfileAction } from "@/app/actions/admin";
import { toast } from "sonner";

interface FriendUser {
  id: string;
  name: string;
  slug: string | null;
  avatar: string | null;
  bio: string | null;
  publicHomepage: boolean;
  lastPostAt: string | null;
}

interface SiteProfile {
  title: string;
  desc: string;
  logo: string;
  cover: string;
}

export function FriendsClient() {
  const [siteProfile, setSiteProfile] = useState<SiteProfile | null>(null);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const res = await getSiteFcProfileAction();
    if (res.success && res.profile) setSiteProfile(res.profile);
  }, []);

  const loadFriends = useCallback(async () => {
    setLoading(true);
    const res = await getFriendsCircleAction();
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else if (res.users) {
      setFriends(res.users as FriendUser[]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch in effect is standard pattern
    loadProfile();
    loadFriends();
  }, [loadProfile, loadFriends]);

  // Header = the global site (friends-circle) profile, strictly separate from any personal profile.
  const profileUser = {
    name: siteProfile?.title || "朋友圈",
    slug: null,
    avatar: siteProfile?.logo || null,
    bio: siteProfile?.desc || null,
    coverImage: siteProfile?.cover || null,
  };

  return (
    <TimelineShell
      profileUser={profileUser}
      posts={[]}
      loadingPosts={false}
      hasMore={false}
      loadingMore={false}
      onLoadMore={() => {}}
      onRefresh={loadFriends}
      onProfileUpdated={loadProfile}
      showBackButton
      showPostEditor="never"
    >
      <div className="divide-y divide-border/60">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">好友圈</h2>
          <span className="text-xs text-muted-foreground">共 {friends.length} 位好友</span>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-center text-xs text-muted-foreground">加载中...</div>
        ) : friends.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-muted-foreground">暂无好友</div>
        ) : (
          friends.map((u) => {
            const title = u.name;
            const desc = u.bio;
            const logo = u.avatar;
            const inner = (
              <>
                <div className="min-w-0 max-w-[55%]">
                  <div className="truncate text-sm font-medium text-foreground">{title}</div>
                  {desc ? (
                    <div className="truncate text-xs text-muted-foreground">{desc}</div>
                  ) : (
                    <div className="truncate text-xs text-muted-foreground/50">这位好友还没有写简介</div>
                  )}
                </div>
                {/* Book-TOC style dotted leader */}
                <span className="mx-3 flex-1 border-b border-dashed border-muted-foreground/25 translate-y-[-2px]" />
                <div className="size-9 rounded-full overflow-hidden bg-muted shrink-0 border border-border">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt={title} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm font-semibold">
                      {title.charAt(0)}
                    </div>
                  )}
                </div>
              </>
            );

            return u.slug ? (
              <Link key={u.id} href={`/u/${u.slug}`} className="flex items-center py-4 px-4 hover:bg-muted/40 transition-colors">
                {inner}
              </Link>
            ) : (
              <div key={u.id} className="flex items-center py-4 px-4">
                {inner}
              </div>
            );
          })
        )}
      </div>
    </TimelineShell>
  );
}

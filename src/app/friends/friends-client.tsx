"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { TimelineShell } from "@/components/timeline-shell";
import { getFriendsCircleAction } from "@/app/actions/posts";
import { FriendCircleProfileModal } from "@/components/friend-circle-profile-modal";
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

interface CurrentUser {
  id: string;
  name: string;
  avatar: string | null;
  coverImage: string | null;
  bio: string | null;
}

const PLACEHOLDER_PROFILE = {
  name: "好友圈",
  slug: null,
  avatar: null,
  coverImage: null,
  bio: "全部好友",
};

export function FriendsClient() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    }
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
    loadSession();
    loadFriends();
  }, [loadSession, loadFriends]);

  const profileUser = currentUser
    ? {
        id: currentUser.id,
        name: currentUser.name,
        avatar: currentUser.avatar,
        coverImage: currentUser.coverImage,
        bio: currentUser.bio,
        slug: null,
      }
    : PLACEHOLDER_PROFILE;

  return (
    <>
      <TimelineShell
        profileUser={profileUser}
        posts={[]}
        loadingPosts={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={() => {}}
        onRefresh={loadFriends}
        onProfileUpdated={loadSession}
        onOwnAvatarClick={currentUser ? () => setModalOpen(true) : undefined}
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
              const inner = (
                <>
                  <div className="min-w-0 max-w-[55%]">
                    <div className="truncate text-sm font-medium text-foreground">{u.name}</div>
                    {u.bio ? (
                      <div className="truncate text-xs text-muted-foreground">{u.bio}</div>
                    ) : (
                      <div className="truncate text-xs text-muted-foreground/50">这位好友还没有写简介</div>
                    )}
                  </div>
                  {/* Book-TOC style dotted leader */}
                  <span className="mx-3 flex-1 border-b border-dotted border-muted-foreground/40 translate-y-[-2px]" />
                  <div className="size-9 rounded-full overflow-hidden bg-muted shrink-0 border border-border">
                    {u.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar} alt={u.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm font-semibold">
                        {u.name.charAt(0)}
                      </div>
                    )}
                  </div>
                </>
              );

              return u.slug ? (
                <Link key={u.id} href={`/u/${u.slug}`} className="flex items-center py-3 px-4 hover:bg-muted/40 transition-colors">
                  {inner}
                </Link>
              ) : (
                <div key={u.id} className="flex items-center py-3 px-4">
                  {inner}
                </div>
              );
            })
          )}
        </div>
      </TimelineShell>

      {currentUser && (
        <FriendCircleProfileModal
          user={{
            name: currentUser.name,
            avatar: currentUser.avatar,
            coverImage: currentUser.coverImage,
            bio: currentUser.bio,
          }}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            loadSession();
            loadFriends();
          }}
        />
      )}
    </>
  );
}

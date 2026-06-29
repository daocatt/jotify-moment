"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AuthModals } from "@/components/auth-modals";
import { PostEditor } from "@/components/post-editor";
import { MomentPost } from "@/components/moment-post";
import { Lightbox } from "@/components/lightbox";
import { ProfileEditModal } from "@/components/profile-edit-modal";
import { AdminPanel } from "@/components/admin-panel";
import { getPostsAction } from "@/app/actions/posts";
import { getSettingsAction } from "@/app/actions/admin";
import { toast } from "sonner";
import { LogIn, LogOut, Shield, UserRoundPen, Moon, Sun, Loader2 } from "lucide-react";
import { useTheme } from "next-themes";

interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  avatar: string | null;
  bio: string | null;
  coverImage: string | null;
}

interface PostData {
  id: string;
  userId: string;
  content: string;
  mediaUrls: Array<{ type: string; url: string; name: string; duration?: number }>;
  ytVideoId: string | null;
  status: "approved" | "pending";
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    role: string;
  };
  comments: Array<{
    id: string;
    content: string;
    createdAt: Date;
    userId: {
      id: string;
      name: string;
      avatar: string | null;
    };
  }>;
  reactions: Array<{
    id: string;
    emoji: string;
    userId: {
      id: string;
      name: string;
    };
  }>;
}

export default function Home() {
  const { theme, setTheme } = useTheme();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register">("login");
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);

  const [posts, setPosts] = useState<PostData[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const [sysSettings, setSysSettings] = useState<Record<string, string>>({});

  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const fetchSession = useCallback(async () => {
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

  const fetchSettings = useCallback(async () => {
    const res = await getSettingsAction();
    if (res.settings) {
      setSysSettings(res.settings);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setCurrentUser(null);
      toast.success("已成功登出账户");
      fetchPosts();
    } catch {
      toast.error("登出失败，请重试");
    }
  }, [fetchPosts]);

  const initData = useCallback(() => {
    fetchSession();
    fetchPosts();
    fetchSettings();
  }, [fetchSession, fetchPosts, fetchSettings]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initData();
  }, [initData]);

  const openLightbox = (images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  return (
    <main className="flex-1 w-full max-w-xl mx-auto bg-background min-h-screen border-x border-border shadow-sm flex flex-col relative pb-10">

      <header className="absolute top-4 left-4 right-4 z-20 flex justify-between items-center bg-black/25 backdrop-blur-sm px-3 py-2 rounded-full border border-white/10 text-white">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="size-8 rounded-full text-white hover:bg-white/20 hover:text-white"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </div>

        <div className="flex items-center gap-1">
          {currentUser ? (
            <>
              {(currentUser.role === "super_admin" || currentUser.role === "admin") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAdminModalOpen(true)}
                  className="h-8 text-xs font-medium text-white hover:bg-white/20 hover:text-white flex items-center gap-1"
                >
                  <Shield size={14} /> 控制台
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setProfileModalOpen(true)}
                className="h-8 text-xs font-medium text-white hover:bg-white/20 hover:text-white flex items-center gap-1"
              >
                <UserRoundPen size={14} /> 资料
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="h-8 text-xs font-medium text-white hover:bg-white/20 hover:text-white flex items-center gap-1"
              >
                <LogOut size={14} /> 登出
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAuthModalMode("login");
                  setAuthModalOpen(true);
                }}
                className="h-8 text-xs font-medium text-white hover:bg-white/20 hover:text-white flex items-center gap-1"
              >
                <LogIn size={14} /> 登录
              </Button>
              {sysSettings.allow_registration !== "false" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAuthModalMode("register");
                    setAuthModalOpen(true);
                  }}
                  className="h-8 text-xs font-medium text-white hover:bg-white/20 hover:text-white"
                >
                  注册
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      <div className="relative w-full h-[260px] sm:h-[300px] bg-neutral-900 overflow-hidden">
        <img
          src={currentUser?.coverImage || "/default-cover.jpg"}
          alt="Timeline Cover"
          className="w-full h-full object-cover opacity-85"
        />

        <div className="absolute right-4 bottom-[-30px] flex items-center gap-4 z-10">
          <div className="text-right pb-4 text-white drop-shadow-md select-none">
            <h2 className="font-bold text-lg sm:text-xl">
              {currentUser ? currentUser.name : "Moment 访客"}
            </h2>
            <p className="text-xs text-white/70 max-w-[200px] truncate mt-1">
              {currentUser?.bio || "记录生活，分享此刻"}
            </p>
          </div>

          <div className="relative">
            <Avatar className="size-16 sm:size-20 rounded-xl border-[3px] border-white dark:border-zinc-900 shadow-lg object-cover bg-background">
              {currentUser?.avatar ? (
                <img src={currentUser.avatar} alt="User Avatar" className="w-full h-full object-cover" />
              ) : (
                <AvatarFallback className="font-bold text-lg sm:text-xl">
                  {currentUser ? currentUser.name.charAt(0) : "G"}
                </AvatarFallback>
              )}
            </Avatar>
          </div>
        </div>
      </div>

      <div className="h-10"></div>

      {currentUser && (
        <div className="px-4 py-3 border-b border-border/60">
          <PostEditor onSuccess={() => { fetchPosts(); fetchSession(); }} />
        </div>
      )}

      <div className="flex-1 divide-y divide-border/60">
        {loadingPosts && posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="animate-spin text-muted-foreground mb-2" />
            <span className="text-sm text-muted-foreground">正在加载时间线日志...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground text-sm">
            时间线上空空如也，发布第一条日志吧。
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <MomentPost
                key={post.id}
                post={post}
                currentUser={currentUser}
                onOpenLightbox={openLightbox}
                onRefresh={() => { fetchPosts(); fetchSession(); }}
              />
            ))}
            {hasMore && (
              <div className="flex justify-center py-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchPosts(true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? <Loader2 className="animate-spin mr-2 size-4" /> : null}
                  {loadingMore ? "加载中..." : "加载更多"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {authModalOpen && (
        <AuthModals
          isOpen={authModalOpen}
          initialMode={authModalMode}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={() => {
            fetchSession();
            fetchPosts();
          }}
        />
      )}

      {profileModalOpen && currentUser && (
        <ProfileEditModal
          user={currentUser}
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          onSuccess={() => {
            fetchSession();
            fetchPosts();
          }}
        />
      )}

      {adminModalOpen && currentUser && (
        <AdminPanel
          isOpen={adminModalOpen}
          currentUser={currentUser}
          onClose={() => setAdminModalOpen(false)}
          onRefresh={() => {
            fetchSession();
            fetchPosts();
            fetchSettings();
          }}
        />
      )}

      {lightboxOpen && (
        <Lightbox
          images={lightboxImages}
          activeIndex={lightboxIndex}
          onChange={setLightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </main>
  );
}

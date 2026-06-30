"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthModals } from "@/components/auth-modals";
import { PostEditor } from "@/components/post-editor";
import { MomentPost } from "@/components/moment-post";
import { Lightbox } from "@/components/lightbox";
import { ProfileEditModal } from "@/components/profile-edit-modal";
import { AdminPanel } from "@/components/admin-panel";
import { getSettingsAction } from "@/app/actions/admin";
import { toast } from "sonner";
import { LogOut, Shield, Moon, Sun, Loader2, ArrowLeft } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  slug: string | null;
  role: string;
  status: string;
  avatar: string | null;
  bio: string | null;
  coverImage: string | null;
}

export interface PostData {
  id: string;
  userId: string;
  content: string;
  mediaUrls: Array<{ type: string; url: string; name: string; duration?: number }>;
  ytVideoId: string | null;
  status: "approved" | "pending";
  pinnedAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    role: string;
    slug: string | null;
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

export interface ProfileUser {
  id?: string;
  name: string;
  slug: string | null;
  avatar: string | null;
  bio: string | null;
  coverImage: string | null;
}

interface TimelineShellProps {
  profileUser: ProfileUser;
  posts: PostData[];
  loadingPosts: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
  showBackButton?: boolean;
  showPostEditor?: "always" | "own" | "never";
  pinnedEntry?: React.ReactNode;
  onAvatarClick?: () => void;
}

export function TimelineShell({
  profileUser,
  posts,
  loadingPosts,
  hasMore,
  loadingMore,
  onLoadMore,
  onRefresh,
  showBackButton = false,
  showPostEditor = "never",
  pinnedEntry,
  onAvatarClick,
}: TimelineShellProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register">("login");
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [sysSettings, setSysSettings] = useState<Record<string, string>>({});

  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const coverRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

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
      onRefresh();
    } catch {
      toast.error("登出失败，请重试");
    }
  }, [onRefresh]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSession();
    fetchSettings();
  }, [fetchSession, fetchSettings]);

  useEffect(() => {
    const el = coverRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowStickyBar(!entry.isIntersecting);
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const openLightbox = (images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const isOwnPage = !!(profileUser.id && currentUser && profileUser.id === currentUser.id);
  const renderEditor =
    showPostEditor === "always" ? !!currentUser : showPostEditor === "own" ? isOwnPage : false;

  const handleBannerAvatarClick = () => {
    if (isOwnPage) {
      setProfileModalOpen(true);
    } else {
      onAvatarClick?.();
    }
  };

  const goToOwnHome = () => {
    if (currentUser?.slug) {
      router.push(`/${currentUser.slug}`);
    } else {
      toast.error("尚未设置主页路径");
    }
  };

  return (
    <main className="flex-1 w-full max-w-xl mx-auto bg-card min-h-screen border-x border-border shadow-sm flex flex-col relative sm:mt-6 sm:rounded-t-xl sm:border-t sm:overflow-visible">

      {/* Top-left: Back + Theme toggle */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        {showBackButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            className="size-8 rounded-full text-white hover:bg-white/20 hover:text-white bg-black/25 backdrop-blur-sm border border-white/10"
          >
            <ArrowLeft size={16} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="size-8 rounded-full text-white hover:bg-white/20 hover:text-white bg-black/25 backdrop-blur-sm border border-white/10"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
      </div>

      {/* Sticky Top Bar */}
      <div
        className={`fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-xl z-30 transition-all duration-300 ease-in-out ${
          showStickyBar
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between px-4 h-12 bg-background/90 backdrop-blur-md border-b border-border/60 shadow-sm">
          <span className="font-semibold text-sm text-foreground truncate">
            {profileUser.name}
          </span>
          <button
            type="button"
            onClick={() => currentUser && goToOwnHome()}
            className={`size-7 rounded overflow-hidden bg-muted shrink-0 ${currentUser ? "cursor-pointer" : "cursor-default"}`}
          >
            {currentUser?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentUser.avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs font-semibold">
                {currentUser ? currentUser.name.charAt(0) : "G"}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Floating Vertical Navigation */}
      <div className="fixed bottom-6 left-0 md:left-[calc(50%-320px)] md:bottom-12 z-40 flex flex-col gap-2">
        {currentUser ? (
          <>
            {(currentUser.role === "super_admin" || currentUser.role === "admin") && (
              <Button
                variant="outline"
                onClick={() => setAdminModalOpen(true)}
                className="w-8 h-auto py-2.5 bg-background border border-border text-foreground shadow-sm hover:bg-muted flex flex-col items-center gap-1.5 rounded-none border-l-0 md:border-r-0 md:border-l"
              >
                <Shield size={13} className="shrink-0" />
                <span className="flex flex-col items-center text-[9px] leading-tight font-medium">
                  <span>控</span>
                  <span>制</span>
                  <span>台</span>
                </span>
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleLogout}
              className="w-8 h-auto py-2.5 bg-background border border-border text-foreground shadow-sm hover:bg-muted flex flex-col items-center gap-1.5 rounded-none border-l-0 md:border-r-0 md:border-l"
            >
              <LogOut size={13} className="shrink-0" />
              <span className="flex flex-col items-center text-[9px] leading-tight font-medium">
                <span>登</span>
                <span>出</span>
              </span>
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setAuthModalMode("login");
                setAuthModalOpen(true);
              }}
              className="w-8 h-auto py-2.5 bg-background border border-border text-foreground shadow-sm hover:bg-muted flex flex-col items-center gap-1.5 rounded-none border-l-0 md:border-r-0 md:border-l"
            >
              <span className="flex flex-col items-center text-[9px] leading-tight font-medium">
                <span>登</span>
                <span>录</span>
              </span>
            </Button>
            {sysSettings.allow_registration !== "false" && (
              <Button
                variant="outline"
                onClick={() => {
                  setAuthModalMode("register");
                  setAuthModalOpen(true);
                }}
                className="w-8 h-auto py-2.5 bg-background border border-border text-foreground shadow-sm hover:bg-muted flex flex-col items-center gap-1.5 rounded-none border-l-0 md:border-r-0 md:border-l"
              >
                <span className="flex flex-col items-center text-[9px] leading-tight font-medium">
                  <span>注</span>
                  <span>册</span>
                </span>
              </Button>
            )}
          </>
        )}
      </div>

      {/* Cover Photo Banner */}
      <div ref={coverRef} className="relative w-full h-[260px] sm:h-[300px] bg-neutral-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={profileUser.coverImage || "/default-cover.jpg"}
          alt="Timeline Cover"
          className="w-full h-full object-cover opacity-85"
        />
        <div className="absolute bottom-4 right-[calc(1rem+4rem+0.75rem)] sm:right-[calc(1rem+5rem+0.75rem)] z-10 text-right select-none">
          <h2 className="font-bold text-lg sm:text-xl text-white drop-shadow-md leading-tight">
            {profileUser.name}
          </h2>
        </div>
        <div className="absolute right-4 bottom-0 translate-y-1/2 z-10">
          <button
            type="button"
            onClick={handleBannerAvatarClick}
            className={`size-16 sm:size-20 rounded-sm overflow-hidden bg-background ring-2 ring-background block outline-none focus-visible:ring-foreground ${onAvatarClick || isOwnPage ? "cursor-pointer" : "cursor-default"}`}
            title={isOwnPage ? "编辑个人资料" : undefined}
          >
            {profileUser.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profileUser.avatar} alt="User Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground font-bold text-lg sm:text-xl">
                {profileUser.name.charAt(0)}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Bio */}
      <div className="flex items-center justify-end px-4 pt-2 pb-2">
        <p className="text-xs text-muted-foreground truncate max-w-[200px] text-right pr-3">
          {profileUser.bio || "记录生活，分享此刻"}
        </p>
        <div className="w-16 sm:w-20 h-8 sm:h-10 shrink-0" />
      </div>

      {renderEditor && currentUser && (
        <div className="px-4 py-3 border-b border-border/60">
          <PostEditor onSuccess={onRefresh} />
        </div>
      )}

      {pinnedEntry}

      <div className="flex-1 divide-y divide-border/60">
        {loadingPosts && posts.length === 0 ? (
          <div className="divide-y divide-border/60">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-4 p-4 animate-pulse">
                <div className="size-10 rounded bg-border/50 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-border/50 rounded w-24" />
                  <div className="h-3 bg-border/50 rounded w-full" />
                  <div className="h-3 bg-border/50 rounded w-3/4" />
                  <div className="h-24 bg-border/50 rounded w-full mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div>
            <div className="divide-y divide-border/60 opacity-30 pointer-events-none">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex gap-4 p-4">
                  <div className="size-10 rounded bg-border/50 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-border/50 rounded w-20" />
                    <div className="h-3 bg-border/50 rounded w-full" />
                    <div className="h-3 bg-border/50 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground py-3">时间线上空空如也，发布第一条日志吧。</p>
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <MomentPost
                key={post.id}
                post={post}
                currentUser={currentUser}
                onOpenLightbox={openLightbox}
                onRefresh={onRefresh}
              />
            ))}
            {hasMore && (
              <div className="flex justify-center py-4">
                <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loadingMore}>
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
            onRefresh();
          }}
        />
      )}

      {profileModalOpen && isOwnPage && currentUser && (
        <ProfileEditModal
          user={currentUser}
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          onSuccess={() => {
            fetchSession();
            onRefresh();
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
            onRefresh();
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
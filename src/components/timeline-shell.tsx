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
import { LogOut, Shield, Moon, Sun, Loader2, ArrowLeft, Pen, MessageCircle, Send, Link, Code2, Home } from "lucide-react";
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
  wechat: string | null;
  telegram: string | null;
  github: string | null;
  x: string | null;
  otherLink: string | null;
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
  wechat?: string | null;
  telegram?: string | null;
  github?: string | null;
  x?: string | null;
  otherLink?: string | null;
}

interface TimelineShellProps {
  profileUser: ProfileUser;
  posts: PostData[];
  loadingPosts: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
  onProfileUpdated?: () => void;
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
  onProfileUpdated,
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
  const [editorOpen, setEditorOpen] = useState(false);
  const [avatarHovered, setAvatarHovered] = useState(false);
  const [bannerHovered, setBannerHovered] = useState(false);
  const [coverExpanded, setCoverExpanded] = useState(false);
  const [sysSettings, setSysSettings] = useState<Record<string, string> | null>(null);

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
    setSysSettings(res.settings || {});
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
  const isGuest = currentUser?.role === "guest";
  const renderEditor = isGuest
    ? false
    : showPostEditor === "always"
    ? !!currentUser
    : showPostEditor === "own"
    ? isOwnPage
    : false;

  const handleBannerAvatarClick = () => {
    if (isOwnPage) {
      setProfileModalOpen(true);
    } else {
      onAvatarClick?.();
    }
  };

  const goToOwnHome = () => {
    if (currentUser?.slug) {
      router.push(`/u/${currentUser.slug}`);
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
            className="size-8 min-h-0 rounded-full text-white hover:bg-white/20 hover:text-white bg-black/25 backdrop-blur-sm border border-white/10"
          >
            <ArrowLeft size={16} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="size-8 min-h-0 rounded-full text-white hover:bg-white/20 hover:text-white bg-black/25 backdrop-blur-sm border border-white/10"
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
          <div
            onMouseEnter={() => setAvatarHovered(true)}
            onMouseLeave={() => setAvatarHovered(false)}
            className="group relative size-7 rounded-full overflow-hidden bg-muted shrink-0"
          >
            <button
              type="button"
              onClick={() => currentUser && (isOwnPage ? setProfileModalOpen(true) : goToOwnHome())}
              className={`block size-full relative ${currentUser ? "cursor-pointer" : "cursor-default"}`}
              title={currentUser ? (isOwnPage ? "编辑个人资料" : "我的主页") : undefined}
            >
              {currentUser?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentUser.avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs font-semibold">
                  {currentUser ? currentUser.name.charAt(0) : "G"}
                </div>
              )}
              {currentUser && isOwnPage && (
                <div className={`absolute inset-0 flex items-center justify-center bg-black/45 text-white transition-opacity ${avatarHovered ? "opacity-100" : "opacity-100 sm:opacity-0"}`}>
                  <Pen size={12} />
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Floating Vertical Navigation */}
      <div className="fixed bottom-10 left-0 md:left-[calc(50%-320px)] md:bottom-16 z-40 flex flex-col gap-2">
        {currentUser ? (
          <>
            {currentUser.role !== "super_admin" && currentUser.slug && (
              <Button
                variant="outline"
                onClick={() => router.push(`/u/${currentUser.slug}`)}
                className="w-8 h-auto py-2.5 bg-background border border-border text-foreground shadow-sm hover:bg-muted flex flex-col items-center gap-1.5 rounded-none border-l-0 md:border-r-0 md:border-l"
              >
                <Home size={13} className="shrink-0" />
                <span className="flex flex-col items-center text-[9px] leading-tight font-medium">
                  <span>我</span>
                  <span>的</span>
                </span>
              </Button>
            )}
            {renderEditor && (
              <Button
                variant={editorOpen ? "default" : "outline"}
                onClick={() => {
                  setEditorOpen((v) => {
                    const next = !v;
                    if (next) {
                      setTimeout(() => {
                        document.getElementById("post-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 50);
                    }
                    return next;
                  });
                }}
                className="w-8 h-auto py-2.5 bg-background border border-border text-foreground shadow-sm hover:bg-muted flex flex-col items-center gap-1.5 rounded-none border-l-0 md:border-r-0 md:border-l"
              >
                <Pen size={13} className="shrink-0" />
                <span className="flex flex-col items-center text-[9px] leading-tight font-medium">
                  <span>发</span>
                  <span>布</span>
                </span>
              </Button>
            )}
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
            {sysSettings && sysSettings.allow_registration !== "false" && (
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
      <div
        ref={coverRef}
        className={`relative w-full bg-neutral-900 transition-all duration-500 ease-in-out cursor-pointer ${coverExpanded ? "h-[420px] sm:h-[460px] overflow-hidden" : "h-[260px] sm:h-[300px]"}`}
        onClick={() => setCoverExpanded((v) => !v)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={profileUser.coverImage || "/default-cover.jpg"}
          alt="Timeline Cover"
          className={`w-full h-full object-cover transition-all duration-500 ${coverExpanded ? "opacity-30 blur-sm scale-105" : "opacity-85"}`}
        />

        {/* Default state: name + avatar (hidden when expanded) */}
        <div className={`absolute bottom-4 right-[calc(1rem+4rem+0.75rem)] sm:right-[calc(1rem+5rem+0.75rem)] z-10 text-right select-none transition-all duration-300 ${coverExpanded ? "opacity-0 translate-y-2 pointer-events-none" : "opacity-100 translate-y-0"}`}>
          <h2 className="font-bold text-lg sm:text-xl text-white drop-shadow-md leading-tight">
            {profileUser.name}
          </h2>
        </div>
        <div
          onMouseEnter={() => setBannerHovered(true)}
          onMouseLeave={() => setBannerHovered(false)}
          onClick={(e) => e.stopPropagation()}
          className={`absolute right-4 bottom-0 translate-y-1/2 z-20 transition-all duration-300 ${coverExpanded ? "opacity-0 translate-y-4 pointer-events-none" : "opacity-100 translate-y-1/2"}`}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleBannerAvatarClick(); }}
            className={`size-16 sm:size-20 rounded-md overflow-hidden bg-background ring-2 ring-background block outline-none focus-visible:ring-foreground ${onAvatarClick || isOwnPage ? "cursor-pointer" : "cursor-default"}`}
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
          {isOwnPage && (
            <div className={`absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white rounded-md transition-opacity pointer-events-none ${bannerHovered ? "sm:opacity-100 opacity-0" : "opacity-0"}`}>
              <Pen size={18} />
              <span className="text-[10px] mt-0.5">编辑</span>
            </div>
          )}
        </div>

        {/* Expanded state: profile info overlay */}
        <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center px-6 transition-all duration-300 ${coverExpanded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
          <div className="flex items-center gap-4 mb-4">
            <div className="size-16 sm:size-20 rounded-md overflow-hidden bg-background ring-2 ring-background shrink-0">
              {profileUser.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileUser.avatar} alt="User Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground font-bold text-lg sm:text-xl">
                  {profileUser.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="text-left min-w-0">
              <h2 className="font-bold text-lg sm:text-xl text-white drop-shadow-md leading-tight">
                {profileUser.name}
              </h2>
              <p className="text-xs text-white/80 mt-0.5 max-w-[240px] break-words leading-relaxed">
                {profileUser.bio || "记录生活，分享此刻"}
              </p>
            </div>
          </div>

          {(() => {
            const links: Array<{ icon: React.ReactNode; label: string; href?: string }> = [];
            if (profileUser.wechat) links.push({ icon: <MessageCircle size={14} />, label: `WeChat: ${profileUser.wechat}` });
            if (profileUser.telegram) {
              const val = profileUser.telegram;
              const href = val.startsWith("http") ? val : `https://t.me/${val.replace(/^@/, "")}`;
              links.push({ icon: <Send size={14} />, label: "Telegram", href });
            }
            if (profileUser.github) {
              const val = profileUser.github;
              const href = val.startsWith("http") ? val : `https://github.com/${val}`;
              links.push({ icon: <Code2 size={14} />, label: "GitHub", href });
            }
            if (profileUser.x) {
              const val = profileUser.x;
              const href = val.startsWith("http") ? val : `https://x.com/${val.replace(/^@/, "")}`;
              links.push({ icon: <span className="font-bold text-xs" style={{ fontFamily: "system-ui" }}>X</span>, label: "X", href });
            }
            if (profileUser.otherLink) {
              const val = profileUser.otherLink;
              const href = val.startsWith("http") ? val : `https://${val}`;
              links.push({ icon: <Link size={14} />, label: "链接", href });
            }
            if (links.length === 0) return null;
            return (
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 max-w-[360px]">
                {links.map((link, i) => (
                  link.href ? (
                    <a
                      key={i}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 text-white/90 hover:text-white text-xs transition-colors"
                    >
                      {link.icon}
                      <span>{link.label}</span>
                    </a>
                  ) : (
                    <span key={i} className="flex items-center gap-1.5 text-white/90 text-xs">
                      {link.icon}
                      <span>{link.label}</span>
                    </span>
                  )
                ))}
              </div>
            );
          })()}

          <p className="text-[10px] text-white/50 mt-4">点击收起</p>
        </div>
      </div>

      {/* Bio (hidden when cover expanded) */}
      <div className={`flex items-center justify-end px-4 pt-2 pb-2 transition-all duration-300 ${coverExpanded ? "h-0 pt-0 pb-0 overflow-hidden opacity-0" : ""}`}>
        <p className="text-xs text-muted-foreground truncate max-w-[200px] text-right pr-3">
          {profileUser.bio || "记录生活，分享此刻"}
        </p>
        <div className="w-16 sm:w-20 h-8 sm:h-10 shrink-0" />
      </div>

      {renderEditor && currentUser && editorOpen && (
        <div id="post-editor" className="px-4 py-3 border-b border-border/60 scroll-mt-16">
          <PostEditor onSuccess={() => { setEditorOpen(false); onRefresh(); }} />
        </div>
      )}

      {pinnedEntry}

      <div className="flex-1 divide-y divide-border/60 pb-20">
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
                onRequireLogin={() => {
                  setAuthModalMode("login");
                  setAuthModalOpen(true);
                }}
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

      {profileModalOpen && currentUser && (
        <ProfileEditModal
          user={currentUser}
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          onSuccess={() => {
            fetchSession();
            onProfileUpdated?.();
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
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthModals } from "@/components/auth-modals";
import { PostEditor } from "@/components/post-editor";
import { MomentPost } from "@/components/moment-post";
import { Lightbox } from "@/components/lightbox";
import { ProfileEditModal } from "@/components/profile-edit-modal";
import { getPublicSettingsAction } from "@/app/actions/admin";
import { generateSSOTokenAction } from "@/app/actions/auth";
import { resolveThemeConfig } from "@/lib/theme-resolver";
import { useSSOCallback } from "@/lib/use-sso";
import { toast } from "sonner";
import { LogOut, Shield, Moon, Sun, ArrowLeft, Pen, Link, CircleUserRound, Info, Globe } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { APP_VERSION } from "@/lib/version";

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
  telegramChatId: string | null;
  telegramBindToken: string | null;
  github: string | null;
  x: string | null;
  otherLink: string | null;
  customDomain: string | null;
  allowCustomDomain: boolean;
}

export interface PostData {
  id: string;
  userId: string;
  content: string;
  mediaUrls: Array<{ type: string; url: string; name: string; duration?: number; thumbnailUrl?: string }>;
  ytVideoId: string | null;
  status: "approved" | "pending";
  pinnedAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    name: string;
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
  theme?: string | null;
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
  isCustomDomain?: boolean;
  mainHost?: string;
  isUserHomePage?: boolean;
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
  isCustomDomain = false,
  mainHost,
  isUserHomePage = false,
}: TimelineShellProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register">("login");
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [avatarHovered, setAvatarHovered] = useState(false);
  const [bannerHovered, setBannerHovered] = useState(false);
  const [coverExpanded, setCoverExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [sysSettings, setSysSettings] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!loadingPosts && posts.length > 0) {
      const t = setTimeout(() => setRevealed(true), 50);
      return () => clearTimeout(t);
    } else {
      setRevealed(false);
    }
  }, [loadingPosts, posts.length]);
  
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted 
    ? (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches))
    : false;

  const [savedThemeId, setSavedThemeId] = useState<string | null>(null);
  useEffect(() => {
    setSavedThemeId(localStorage.getItem("active-theme"));
  }, []);

  const activeThemeId = profileUser?.theme || sysSettings?.global_theme || savedThemeId || "default";
  const resolvedTheme = useMemo(() => resolveThemeConfig(activeThemeId), [activeThemeId]);

  const themeReady = !!(profileUser?.theme || sysSettings?.global_theme || savedThemeId || sysSettings !== null);
  const showThemeToggle = themeReady && resolvedTheme.features.supportedModes.includes("light") && resolvedTheme.features.supportedModes.includes("dark");

  useEffect(() => {
    if (!mounted) return;

    if (profileUser?.theme || sysSettings?.global_theme) {
      document.documentElement.setAttribute("data-theme", activeThemeId);
      localStorage.setItem("active-theme", activeThemeId);
    }

    const supportedModes = resolvedTheme.features.supportedModes;
    const currentMode = document.documentElement.classList.contains("dark") ? "dark" : "light";

    if (!supportedModes.includes(currentMode) && supportedModes.length > 0) {
      const forcedMode = supportedModes[0];
      if (currentMode !== forcedMode) {
        const prevKey = "theme-pref-before-forced";
        if (!localStorage.getItem(prevKey)) {
          localStorage.setItem(prevKey, theme);
        }
        setTheme(forcedMode);
      }
    } else {
      const prevPref = localStorage.getItem("theme-pref-before-forced");
      if (prevPref) {
        localStorage.removeItem("theme-pref-before-forced");
        setTheme(prevPref as "light" | "dark" | "system");
      }
    }
  }, [activeThemeId, resolvedTheme.features.supportedModes, setTheme, mounted, sysSettings, theme, profileUser?.theme]);

  useSSOCallback(isCustomDomain);

  useEffect(() => {
    if (typeof window === "undefined" || isCustomDomain || !mounted) return;

    const searchParams = new URLSearchParams(window.location.search);
    const ssoAction = searchParams.get("sso_action");
    if (!ssoAction) return;

    if (currentUser) {
      const callback = searchParams.get("callback");
      if (callback) {
        generateSSOTokenAction(callback).then((tokenRes) => {
          if (tokenRes.success && tokenRes.token) {
            const callbackUrl = new URL(callback);
            callbackUrl.searchParams.set("sso_token", tokenRes.token);
            window.location.href = callbackUrl.toString();
          } else {
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("sso_action");
            cleanUrl.searchParams.delete("callback");
            router.replace(cleanUrl.pathname + cleanUrl.search);
          }
        });
      } else {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("sso_action");
        router.replace(cleanUrl.pathname + cleanUrl.search);
      }
      return;
    }

    if (ssoAction === "login") {
      setAuthModalMode("login");
      setAuthModalOpen(true);
    } else if (ssoAction === "register") {
      setAuthModalMode("register");
      setAuthModalOpen(true);
    }
  }, [currentUser, isCustomDomain, mounted, router]);

  const [aboutOpen, setAboutOpen] = useState(false);

  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const coverRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  const handleLoginClick = useCallback(() => {
    if (isCustomDomain && mainHost) {
      const protocol = window.location.protocol;
      const callback = encodeURIComponent(window.location.href);
      window.location.href = `${protocol}//${mainHost}/?sso_action=login&callback=${callback}`;
    } else {
      setAuthModalMode("login");
      setAuthModalOpen(true);
    }
  }, [isCustomDomain, mainHost]);

  const handleRegisterClick = useCallback(() => {
    if (isCustomDomain && mainHost) {
      const protocol = window.location.protocol;
      const callback = encodeURIComponent(window.location.href);
      window.location.href = `${protocol}//${mainHost}/?sso_action=register&callback=${callback}`;
    } else {
      setAuthModalMode("register");
      setAuthModalOpen(true);
    }
  }, [isCustomDomain, mainHost]);

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
    const res = await getPublicSettingsAction();
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

  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingMore) {
          onLoadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

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
      <div className={`absolute top-4 left-4 z-20 flex items-center gap-2 ${themeReady && !resolvedTheme.features.showCoverImage ? "top-2" : ""}`}>
        {showBackButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            className={`size-8 min-h-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring ${themeReady && resolvedTheme.features.showCoverImage ? "text-white hover:bg-white/20 hover:text-white bg-black/25 backdrop-blur-sm border border-white/10" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <ArrowLeft size={16} />
          </Button>
        )}
        {showThemeToggle && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`size-8 min-h-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring ${themeReady && resolvedTheme.features.showCoverImage ? "text-white hover:bg-white/20 hover:text-white bg-black/25 backdrop-blur-sm border border-white/10" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <span className="t-icon-swap" data-state={isDark ? "a" : "b"}>
              <span className="t-icon" data-icon="a"><Sun size={16} /></span>
              <span className="t-icon" data-icon="b"><Moon size={16} /></span>
            </span>
          </Button>
        )}
        {!showBackButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAboutOpen(true)}
            className={`size-8 min-h-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring ${themeReady && resolvedTheme.features.showCoverImage ? "text-white hover:bg-white/20 hover:text-white bg-black/25 backdrop-blur-sm border border-white/10" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <Info size={16} />
          </Button>
        )}
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
            {isUserHomePage ? (
              <Button
                variant="outline"
                onClick={() => {
                  if (isCustomDomain && mainHost) {
                    window.location.href = `${window.location.protocol}//${mainHost}/`;
                  } else {
                    router.push("/");
                  }
                }}
                className="w-8 h-auto py-2.5 bg-background border border-border text-foreground shadow-sm hover:bg-muted flex flex-col items-center gap-1.5 rounded-none border-l-0 md:border-r-0 md:border-l"
              >
                <ArrowLeft size={13} className="shrink-0" />
                <span className="flex flex-col items-center text-[9px] leading-tight font-medium">
                  <span>返</span>
                  <span>回</span>
                </span>
              </Button>
            ) : currentUser.role === "guest" ? (
              <Button
                variant="outline"
                onClick={() => router.push("/guest-profile")}
                className="w-8 h-auto py-2.5 bg-background border border-border text-foreground shadow-sm hover:bg-muted flex flex-col items-center gap-1.5 rounded-none border-l-0 md:border-r-0 md:border-l"
              >
                <CircleUserRound size={13} className="shrink-0" />
                <span className="flex flex-col items-center text-[9px] leading-tight font-medium">
                  <span>我</span>
                  <span>的</span>
                </span>
              </Button>
            ) : currentUser.slug ? (
              <Button
                variant="outline"
                onClick={() => {
                  router.push(`/u/${currentUser.slug}`);
                }}
                className="w-8 h-auto py-2.5 bg-background border border-border text-foreground shadow-sm hover:bg-muted flex flex-col items-center gap-1.5 rounded-none border-l-0 md:border-r-0 md:border-l"
              >
                <CircleUserRound size={13} className="shrink-0" />
                <span className="flex flex-col items-center text-[9px] leading-tight font-medium">
                  <span>我</span>
                  <span>的</span>
                </span>
              </Button>
            ) : null}
            {isUserHomePage && isOwnPage && currentUser.customDomain && (
              <Button
                variant="outline"
                onClick={() => {
                  window.location.href = `${window.location.protocol}//${currentUser.customDomain}/`;
                }}
                className="w-8 h-auto py-2.5 bg-background border border-border text-foreground shadow-sm hover:bg-muted flex flex-col items-center gap-1.5 rounded-none border-l-0 md:border-r-0 md:border-l"
              >
                <Globe size={13} className="shrink-0" />
                <span className="flex flex-col items-center text-[9px] leading-tight font-medium">
                  <span>主</span>
                  <span>页</span>
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
                onClick={() => window.open("/admin", "_blank")}
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
              onClick={handleLoginClick}
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
                onClick={handleRegisterClick}
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

      {/* Cover Photo Banner / Minimal Header */}
      {!themeReady ? (
        <div className="w-full h-[260px] sm:h-[300px] bg-card" />
      ) : resolvedTheme.features.showCoverImage ? (
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
              className={`size-16 sm:size-20 overflow-hidden bg-background ring-2 ring-background block outline-none focus-visible:ring-foreground rounded-[var(--theme-radius-avatar)] ${onAvatarClick || isOwnPage ? "cursor-pointer" : "cursor-default"}`}
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
              <div className={`absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white transition-opacity pointer-events-none rounded-[var(--theme-radius-avatar)] ${bannerHovered ? "sm:opacity-100 opacity-0" : "opacity-0"}`}>
                <Pen size={18} />
                <span className="text-[10px] mt-0.5">编辑</span>
              </div>
            )}
          </div>

          {/* Expanded state: profile info overlay */}
          <div className={`absolute inset-0 z-10 flex flex-col justify-center items-center px-6 transition-all duration-300 ${coverExpanded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
            <div className="w-full max-w-[360px]">
              <div className="flex items-start gap-4 mb-3">
              <div className={`size-16 sm:size-20 overflow-hidden bg-background ring-2 ring-background shrink-0 rounded-[var(--theme-radius-avatar)]`}>
                {profileUser.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profileUser.avatar} alt="User Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground font-bold text-lg sm:text-xl">
                    {profileUser.name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="text-left min-w-0 flex-1">
                <h2 className="font-bold text-lg sm:text-xl text-white drop-shadow-md leading-tight">
                  {profileUser.name}
                </h2>
                {resolvedTheme.features.showBio && (
                  <p className="text-xs text-white/80 mt-0.5 max-w-[240px] break-words leading-relaxed">
                    {profileUser.bio || "记录生活，分享此刻"}
                  </p>
                )}
              </div>
            </div>

            {(() => {
              const links: Array<{ icon: React.ReactNode; label: string; href?: string }> = [];
              if (profileUser.wechat) links.push({ icon: <svg viewBox="0 0 512 512" className="size-3.5 fill-current"><path d="M408.67,298.53a21,21,0,1,1,20.9-21,20.85,20.85,0,0,1-20.9,21m-102.17,0a21,21,0,1,1,20.9-21,20.84,20.84,0,0,1-20.9,21M458.59,417.39C491.1,394.08,512,359.13,512,319.51c0-71.08-68.5-129.35-154.41-129.35S203.17,248.43,203.17,319.51s68.5,129.34,154.42,129.34c17.41,0,34.83-2.33,49.92-7,2.49-.86,3.48-1.17,4.64-1.17a16.67,16.67,0,0,1,8.13,2.34L454,462.83a11.62,11.62,0,0,0,3.48,1.17,5,5,0,0,0,4.65-4.66,14.27,14.27,0,0,0-.77-3.86c-.41-1.46-5-16-7.36-25.27a18.94,18.94,0,0,1-.33-3.47,11.4,11.4,0,0,1,5-9.35"/><path d="M246.13,178.51a24.47,24.47,0,0,1,0-48.94c12.77,0,24.38,11.65,24.38,24.47,1.16,12.82-10.45,24.47-24.38,24.47m-123.06,0A24.47,24.47,0,1,1,147.45,154a24.57,24.57,0,0,1-24.38,24.47M184.6,48C82.43,48,0,116.75,0,203c0,46.61,24.38,88.56,63.85,116.53C67.34,321.84,68,327,68,329a11.38,11.38,0,0,1-.66,4.49C63.85,345.14,59.4,364,59.21,365s-1.16,3.5-1.16,4.66a5.49,5.49,0,0,0,5.8,5.83,7.15,7.15,0,0,0,3.49-1.17L108,351c3.49-2.33,5.81-2.33,9.29-2.33a16.33,16.33,0,0,1,5.81,1.16c18.57,5.83,39.47,8.16,60.37,8.16h10.45a133.24,133.24,0,0,1-5.81-38.45c0-78.08,75.47-141,168.35-141h10.45C354.1,105.1,277.48,48,184.6,48"/></svg>, label: profileUser.wechat });
              if (profileUser.telegram) {
                const val = profileUser.telegram;
                const href = val.startsWith("http") ? val : `https://t.me/${val.replace(/^@/, "")}`;
                links.push({ icon: <svg viewBox="0 0 32 32" className="size-3.5 fill-current"><path d="M22.122 10.040c0.006-0 0.014-0 0.022-0 0.209 0 0.403 0.065 0.562 0.177l-0.003-0.002c0.116 0.101 0.194 0.243 0.213 0.403l0 0.003c0.020 0.122 0.031 0.262 0.031 0.405 0 0.065-0.002 0.129-0.007 0.193l0-0.009c-0.225 2.369-1.201 8.114-1.697 10.766-0.21 1.123-0.623 1.499-1.023 1.535-0.869 0.081-1.529-0.574-2.371-1.126-1.318-0.865-2.063-1.403-3.342-2.246-1.479-0.973-0.52-1.51 0.322-2.384 0.221-0.23 4.052-3.715 4.127-4.031 0.004-0.019 0.006-0.040 0.006-0.062 0-0.078-0.029-0.149-0.076-0.203l0 0c-0.052-0.034-0.117-0.053-0.185-0.053-0.045 0-0.088 0.009-0.128 0.024l0.002-0.001q-0.198 0.045-6.316 4.174c-0.445 0.351-1.007 0.573-1.619 0.599l-0.006 0c-0.867-0.105-1.654-0.298-2.401-0.573l0.074 0.024c-0.938-0.306-1.683-0.467-1.619-0.985q0.051-0.404 1.114-0.827 6.548-2.853 8.733-3.761c1.607-0.853 3.47-1.555 5.429-2.010l0.157-0.031zM15.93 1.025c-8.302 0.020-15.025 6.755-15.025 15.060 0 8.317 6.742 15.060 15.060 15.060s15.060-6.742 15.060-15.060c0-8.305-6.723-15.040-15.023-15.060h-0.002q-0.035-0-0.070 0z"></path></svg>, label: val, href });
              }
              if (profileUser.github) {
                const val = profileUser.github;
                const href = val.startsWith("http") ? val : `https://github.com/${val}`;
                links.push({ icon: <svg viewBox="0 0 20 20" className="size-3.5 fill-current"><path d="M94,7399 C99.523,7399 104,7403.59 104,7409.253 C104,7413.782 101.138,7417.624 97.167,7418.981 C96.66,7419.082 96.48,7418.762 96.48,7418.489 C96.48,7418.151 96.492,7417.047 96.492,7415.675 C96.492,7414.719 96.172,7414.095 95.813,7413.777 C98.04,7413.523 100.38,7412.656 100.38,7408.718 C100.38,7407.598 99.992,7406.684 99.35,7405.966 C99.454,7405.707 99.797,7404.664 99.252,7403.252 C99.252,7403.252 98.414,7402.977 96.505,7404.303 C95.706,7404.076 94.85,7403.962 94,7403.958 C93.15,7403.962 92.295,7404.076 91.497,7404.303 C89.586,7402.977 88.746,7403.252 88.746,7403.252 C88.203,7404.664 88.546,7405.707 88.649,7405.966 C88.01,7406.684 87.619,7407.598 87.619,7408.718 C87.619,7412.646 89.954,7413.526 92.175,7413.785 C91.889,7414.041 91.63,7414.493 91.54,7415.156 C90.97,7415.418 89.522,7415.871 88.63,7414.304 C88.63,7414.304 88.101,7413.319 87.097,7413.247 C87.097,7413.247 86.122,7413.234 87.029,7413.87 C87.029,7413.87 87.684,7414.185 88.139,7415.37 C88.139,7415.37 88.726,7417.2 91.508,7416.58 C91.513,7417.437 91.522,7418.245 91.522,7418.489 C91.522,7418.76 91.338,7419.077 90.839,7418.982 C86.865,7417.627 84,7413.783 84,7409.253 C84,7403.59 88.478,7399 94,7399" transform="translate(-84, -7399)"/></svg>, label: val, href });
              }
              if (profileUser.x) {
                const val = profileUser.x;
                const href = val.startsWith("http") ? val : `https://x.com/${val.replace(/^@/, "")}`;
                links.push({ icon: <svg viewBox="0 0 251 256" className="size-3.5 fill-current"><path d="M149.078767,108.398529 L242.331303,0 L220.233437,0 L139.262272,94.1209195 L74.5908396,0 L0,0 L97.7958952,142.3275 L0,256 L22.0991185,256 L107.606755,156.605109 L175.904525,256 L250.495364,256 L149.07334,108.398529 L149.078767,108.398529 Z M118.810995,143.581438 L108.902233,129.408828 L30.0617399,16.6358981 L64.0046968,16.6358981 L127.629893,107.647252 L137.538655,121.819862 L220.243874,240.120681 L186.300917,240.120681 L118.810995,143.586865 L118.810995,143.581438 Z"/></svg>, label: val, href });
              }
              if (profileUser.otherLink) {
                const val = profileUser.otherLink;
                const href = val.startsWith("http") ? val : `https://${val}`;
                links.push({ icon: <Link size={14} />, label: val, href });
              }
              if (links.length === 0) return null;
              return (
                <div className="ml-[4.5rem] sm:ml-[5.5rem]">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {links.map((link, i) => (
                      link.href ? (
                        <a
                          key={i}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-white/90 hover:text-white text-xs transition-colors truncate"
                        >
                          {link.icon}
                          <span className="truncate">{link.label}</span>
                        </a>
                      ) : (
                        <span key={i} className="flex items-center gap-1.5 text-white/90 text-xs truncate">
                          {link.icon}
                          <span className="truncate">{link.label}</span>
                        </span>
                      )
                    ))}
                  </div>
                </div>
              );
            })()}

            <p className="text-[10px] text-white/50 mt-4 text-center">点击收起</p>
            </div>
          </div>
        </div>
      ) : (
        /* Minimal layout if cover is hidden (like WeChat, where avatar & name is placed inside a clean header) */
        <div className="w-full pt-16 px-4 pb-4 flex justify-between items-end border-b border-border bg-card">
          <div className="space-y-1 text-left flex-1 min-w-0 pr-4">
            <h2 className="font-bold text-xl text-foreground leading-tight truncate">
              {profileUser.name}
            </h2>
            {resolvedTheme.features.showBio && profileUser.bio && (
              <p className="text-xs text-muted-foreground break-words leading-relaxed max-w-sm">{profileUser.bio}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleBannerAvatarClick}
            className={`size-16 sm:size-20 overflow-hidden bg-background ring-2 ring-border block outline-none focus-visible:ring-foreground shrink-0 rounded-[var(--theme-radius-avatar)] ${onAvatarClick || isOwnPage ? "cursor-pointer" : "cursor-default"}`}
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
      )}

      {/* Bio (hidden when cover expanded) */}
      {resolvedTheme.features.showCoverImage && resolvedTheme.features.showBio && (
        <div className={`flex items-center justify-end px-4 pt-2 pb-2 transition-all duration-300 ${coverExpanded ? "h-0 pt-0 pb-0 overflow-hidden opacity-0" : ""}`}>
          <p className="text-xs text-muted-foreground truncate max-w-[200px] text-right pr-3">
            {profileUser.bio || "记录生活，分享此刻"}
          </p>
          <div className="w-16 sm:w-20 h-8 sm:h-10 shrink-0" />
        </div>
      )}

      {renderEditor && currentUser && editorOpen && (
        <div id="post-editor" className="px-4 py-3 border-b border-border/60 scroll-mt-16">
          <PostEditor onSuccess={() => { setEditorOpen(false); onRefresh(); }} />
        </div>
      )}

      {pinnedEntry}

      <div className="flex-1 divide-y divide-border/60 pb-20">
        {posts.length === 0 && loadingPosts ? (
          <>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse flex gap-4 p-4">
                <div className="size-10 rounded bg-border/50 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-border/50 rounded w-24" />
                  <div className="h-3 bg-border/50 rounded w-full" />
                  <div className="h-3 bg-border/50 rounded w-3/4" />
                  <div className="h-24 bg-border/50 rounded w-full mt-3" />
                </div>
              </div>
            ))}
          </>
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
          <div className={`t-skel ${revealed ? "is-revealed" : ""}`}>
            {loadingPosts && (
              <div className="t-skel-skeleton is-pulsing divide-y divide-border/60">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-4 p-4">
                    <div className="size-10 rounded bg-border/50 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-border/50 rounded w-24" />
                      <div className="h-3 bg-border/50 rounded w-full" />
                      <div className="h-3 bg-border/50 rounded w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="t-skel-content divide-y divide-border/60">
              {posts.map((post) => (
                <MomentPost
                  key={post.id}
                  post={post}
                  currentUser={currentUser}
                  onOpenLightbox={openLightbox}
                  onRefresh={onRefresh}
                  onRequireLogin={handleLoginClick}
                />
              ))}
              {hasMore && (
                <div>
                  {loadingMore && (
                    <div className="divide-y divide-border/60">
                      {[...Array(2)].map((_, i) => (
                        <div key={`sk-${i}`} className="flex gap-4 p-4 animate-pulse">
                          <div className="size-10 rounded bg-border/50 shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 bg-border/50 rounded w-20" />
                            <div className="h-3 bg-border/50 rounded w-full" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div ref={sentinelRef} className="h-1" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {authModalOpen && (
        <AuthModals
          isOpen={authModalOpen}
          initialMode={authModalMode}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={async () => {
            const searchParams = new URLSearchParams(window.location.search);
            const callback = searchParams.get("callback");
            if (callback) {
              const tokenRes = await generateSSOTokenAction(callback);
              if (tokenRes.success && tokenRes.token) {
                const callbackUrl = new URL(callback);
                callbackUrl.searchParams.set("sso_token", tokenRes.token);
                window.location.href = callbackUrl.toString();
                return;
              }
            }
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
          onSuccess={(newSlug?: string) => {
            fetchSession();
            onProfileUpdated?.();
            if (newSlug !== undefined) {
              if (isCustomDomain) {
                window.location.reload();
              } else {
                const slugValue = newSlug || currentUser?.slug || "";
                if (slugValue) {
                  router.replace(`/u/${slugValue}`);
                } else {
                  router.replace("/");
                }
              }
            }
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

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader className="items-center text-center">
            <DialogTitle className="text-xl">Jotify Moment</DialogTitle>
            <DialogDescription className="text-sm">轻日志 轻生活</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 pt-2">
            <span className="text-[11px] text-muted-foreground/60">v{APP_VERSION}</span>
            <span className="text-[11px] text-muted-foreground/60">
              powered by{" "}
              <a
                href="https://zwq.me"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                早晚圈
              </a>
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
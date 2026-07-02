"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MomentPost } from "@/components/moment-post";
import { Lightbox } from "@/components/lightbox";
import { AuthModals } from "@/components/auth-modals";
import { getPostByIdAction } from "@/app/actions/posts";
import { useTheme } from "@/components/theme-provider";
import { resolveThemeConfig } from "@/lib/theme-resolver";
import { toast } from "sonner";

interface MoClientProps {
  id: string;
}

export function MoClient({ id }: MoClientProps) {
  const router = useRouter();
  const { setTheme } = useTheme();

  const [post, setPost] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register">("login");

  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const activeThemeId = post?.user?.theme || "default";
  const resolvedTheme = resolveThemeConfig(activeThemeId);

  useEffect(() => {
    if (post?.user?.theme) {
      document.documentElement.setAttribute("data-theme", post.user.theme);
      
      const supportedModes = resolvedTheme.features.supportedModes;
      if (supportedModes && supportedModes.length > 0) {
        const currentMode = document.documentElement.classList.contains("dark") ? "dark" : "light";
        if (!supportedModes.includes(currentMode)) {
          setTheme(supportedModes[0]);
        }
      }
    }
    return () => {
      document.documentElement.removeAttribute("data-theme");
    };
  }, [post?.user?.theme, resolvedTheme.features.supportedModes, setTheme]);

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

  const fetchPost = useCallback(async () => {
    setLoading(true);
    const res = await getPostByIdAction(id);
    setLoading(false);
    if ("error" in res && res.error) {
      setError(res.error);
    } else if ("post" in res && res.post) {
      setPost(res.post);
    }
  }, [id]);

  useEffect(() => {
    fetchSession();
    fetchPost();
  }, [fetchSession, fetchPost]);

  const openLightbox = (images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  if (loading && !post) {
    return (
      <main className="flex-1 w-full max-w-xl mx-auto bg-card min-h-screen border-x border-border shadow-sm flex items-center justify-center sm:mt-6 sm:rounded-t-xl">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-xs">加载中...</span>
        </div>
      </main>
    );
  }

  if (error || !post) {
    return (
      <main className="flex-1 w-full max-w-xl mx-auto bg-card min-h-screen border-x border-border shadow-sm flex flex-col items-center justify-center gap-3 sm:mt-6 sm:rounded-t-xl p-4">
        <p className="text-sm text-muted-foreground">{error || "加载失败，日志可能已被删除"}</p>
        <Button size="sm" variant="outline" onClick={() => router.push("/")}>返回首页</Button>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full max-w-xl mx-auto bg-card min-h-screen border-x border-border shadow-sm sm:mt-6 sm:rounded-t-xl flex flex-col">
      {/* Header Bar */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border/60 sticky top-0 bg-background/80 backdrop-blur-md z-20">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="font-semibold text-sm sm:text-base text-foreground">日志详情</span>
      </div>

      {/* Moment Content */}
      <div className="flex-1 divide-y divide-border/60 pb-20">
        <MomentPost
          post={post}
          currentUser={currentUser}
          onOpenLightbox={openLightbox}
          onRefresh={fetchPost}
          isDetailsView={true}
          onRequireLogin={() => {
            setAuthModalMode("login");
            setAuthModalOpen(true);
          }}
        />
      </div>

      {/* Lightbox / Gallery */}
      {lightboxOpen && (
        <Lightbox
          images={lightboxImages}
          activeIndex={lightboxIndex}
          onChange={setLightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* Auth Modals */}
      {authModalOpen && (
        <AuthModals
          isOpen={authModalOpen}
          initialMode={authModalMode}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={() => {
            fetchSession();
            fetchPost();
          }}
        />
      )}
    </main>
  );
}

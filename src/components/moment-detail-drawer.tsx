"use client";

import { useState, useEffect, useCallback } from "react";
import { PanelRightClose, X, ExternalLink, Link2, Check, Loader2 } from "lucide-react";
import { MomentPost } from "@/components/moment-post";
import { getPostByIdAction } from "@/app/actions/posts";
import { toast } from "sonner";
import type { PostData } from "@/components/timeline-shell";

export interface MomentDetailDrawerProps {
  isOpen: boolean;
  postId: string | null;
  initialPost?: PostData | null;
  currentUser: { id: string; name: string; role: string; avatar?: string | null } | null;
  isCustomDomain?: boolean;
  mainHost?: string;
  onClose: () => void;
  onRefreshParent: () => void;
  onOpenLightbox: (images: string[], index: number) => void;
  onRequireLogin?: () => void;
}

export function MomentDetailDrawer({
  isOpen,
  postId,
  initialPost,
  currentUser,
  onClose,
  onRefreshParent,
  onOpenLightbox,
  onRequireLogin,
}: MomentDetailDrawerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [post, setPost] = useState<any>(initialPost || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchPost = useCallback(async (id: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await getPostByIdAction(id);
      if ("post" in res && res.post) {
        setPost(res.post);
      } else if ("error" in res && res.error) {
        setError(res.error);
      } else {
        setError("未找到该动态");
      }
    } catch {
      setError("加载详情失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Sync when postId or initialPost changes
  useEffect(() => {
    if (!isOpen || !postId) return;

    if (initialPost && initialPost.id === postId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync selected post into drawer
      setPost(initialPost);
      // Refresh silently in background to ensure latest comments & status
      fetchPost(postId, true);
    } else {
      setPost(null);
      fetchPost(postId, false);
    }
  }, [isOpen, postId, initialPost, fetchPost]);

  const handleCopyLink = useCallback(async () => {
    if (!postId || typeof window === "undefined") return;
    const url = `${window.location.origin}/mo/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("已复制动态链接");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }, [postId]);

  if (!isOpen && !postId) return null;

  return (
    <aside
      aria-label="动态详情抽屉"
      className={`hidden lg:flex flex-col w-[520px] xl:w-[580px] bg-card border-x border-border shadow-2xl sm:mt-6 sm:rounded-t-xl sm:border-t min-h-[calc(100vh-1.5rem)] sticky top-6 max-h-[calc(100vh-1.5rem)] overflow-hidden transition-all duration-300 ease-out z-10 shrink-0 ${
        isOpen && postId
          ? "opacity-100 translate-x-0 pointer-events-auto"
          : "opacity-0 -translate-x-8 pointer-events-none w-0 !m-0 !p-0 border-none overflow-hidden"
      }`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-background/85 backdrop-blur-md z-20 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="收回详情"
            title="收回详情 (Esc)"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer group"
          >
            <PanelRightClose className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            <span>收回</span>
          </button>
          <span className="font-semibold text-sm text-foreground ml-1">日志详情</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyLink}
            aria-label="复制链接"
            title="复制链接"
            className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
          >
            {copied ? <Check className="size-3.5 text-green-500" /> : <Link2 className="size-3.5" />}
          </button>
          {postId && (
            <a
              href={`/mo/${postId}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="新窗口打开"
              title="新窗口打开"
              className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            title="关闭 (Esc)"
            className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer ml-1"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/60 pb-20">
        {loading && !post ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-xs">加载详情中...</span>
          </div>
        ) : error && !post ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground px-4 text-center">
            <p className="text-sm">{error}</p>
            {postId && (
              <button
                type="button"
                onClick={() => fetchPost(postId)}
                className="text-xs text-primary hover:underline cursor-pointer"
              >
                重试
              </button>
            )}
          </div>
        ) : post ? (
          <MomentPost
            post={post}
            currentUser={currentUser}
            onOpenLightbox={onOpenLightbox}
            onRefresh={() => {
              if (postId) fetchPost(postId, true);
              onRefreshParent();
            }}
            isDetailsView={true}
            onRequireLogin={onRequireLogin}
          />
        ) : null}
      </div>
    </aside>
  );
}

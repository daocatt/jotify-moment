"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePresence } from "@/lib/use-presence";
import { PanelRightClose, X, ExternalLink, Link2, Check, Loader2 } from "lucide-react";
import { MomentPost, type MomentPostProps } from "@/components/moment-post";
import { getPostByIdAction } from "@/app/actions/posts";
import { toast } from "sonner";

export interface MomentDetailDrawerProps {
  isOpen: boolean;
  postId: string | null;
  initialPost?: MomentPostProps["post"] | null;
  currentUser: { id: string; name: string; role: string; avatar?: string | null } | null;
  isCustomDomain?: boolean;
  mainHost?: string;
  onClose: () => void;
  /** Fired once the exit transition finishes — used to unmount and unwind history. */
  onAfterClose?: () => void;
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
  onAfterClose,
  onRefreshParent,
  onOpenLightbox,
  onRequireLogin,
}: MomentDetailDrawerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [post, setPost] = useState<any>(initialPost || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The drawer is portalled to <body> so its enter/exit transform never affects
  // the parent layout — the timeline column shifts via its own transform instead.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal needs a DOM target, unavailable during SSR
    setPortalReady(true);
  }, []);

  const presenceOpen = isOpen && !!postId;
  const { mounted, visible, onTransitionEnd } = usePresence(presenceOpen, 340, onAfterClose);

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

  if (!portalReady || !mounted) return null;

  return createPortal(
    <aside
      aria-label="动态详情抽屉"
      aria-hidden={!visible}
      onTransitionEnd={onTransitionEnd}
      // Inline transform: Tailwind's translate utilities are compiled to the
      // `translate` property here, which would not transition together with
      // the inset computed for each breakpoint.
      style={{ transform: visible ? "translateX(0)" : "translateX(100%)", willChange: "transform" }}
      // Pinned to the right edge of the main column instead of the viewport, so
      // the panel always sits flush beside the content. --detail-gutter mirrors
      // the 1rem/2rem padding of the column's flex row in timeline-shell.
      className={`hidden lg:flex flex-col fixed top-6 right-[max(0px,calc((100vw-var(--detail-column-width,576px))/2-var(--detail-gutter,16px)))] z-40 w-[520px] xl:w-[580px] max-h-[calc(100vh-1.5rem)] bg-card border-y border-l border-border shadow-2xl rounded-l-xl overflow-hidden transition-[transform,opacity] duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-background/85 backdrop-blur-md z-20 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            tabIndex={visible ? undefined : -1}
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
            tabIndex={visible ? undefined : -1}
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
              tabIndex={visible ? undefined : -1}
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
            tabIndex={visible ? undefined : -1}
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
    </aside>,
    document.body
  );
}

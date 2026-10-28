"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { MomentPost, type MomentPostProps } from "@/components/moment-post";
import { getPostByIdAction } from "@/app/actions/posts";
import { usePresence } from "@/lib/use-presence";

/** Height the sheet rests at, leaving the page visible behind it (iOS sheet style). */
const PEEK = 40;
/** Drag distance/velocity that dismisses on release. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.5;
const DURATION = 300;

export interface MomentDetailSheetProps {
  isOpen: boolean;
  postId: string | null;
  initialPost?: MomentPostProps["post"] | null;
  currentUser: { id: string; name: string; role: string; avatar?: string | null } | null;
  onClose: () => void;
  /** Fired once the exit transition finishes — used to unmount and unwind history. */
  onAfterClose?: () => void;
  onRefreshParent: () => void;
  onOpenLightbox: (images: string[], index: number) => void;
  onRequireLogin?: () => void;
}

/**
 * Mobile counterpart of the desktop drawer: the page URL switches to /mo/[id]
 * immediately (so the address bar stays shareable), while the detail slides up
 * over the timeline as a sheet. The route is prefetched in the background, so a
 * reload or a shared link lands on the same post as a normal page.
 */
export function MomentDetailSheet({
  isOpen,
  postId: requestedId,
  initialPost,
  currentUser,
  onClose,
  onAfterClose,
  onRefreshParent,
  onOpenLightbox,
  onRequireLogin,
}: MomentDetailSheetProps) {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- post shape from server action extends MomentPostProps
  const [post, setPost] = useState<any>(initialPost || null);
  // Kept after the open flag clears so the sheet still has content to slide out with.
  const [shownId, setShownId] = useState<string | null>(requestedId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal needs a DOM target, unavailable during SSR
    setPortalReady(true);
  }, []);

  const open = isOpen && !!requestedId;
  const { mounted, visible, onTransitionEnd } = usePresence(open, DURATION + 40, onAfterClose);

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

  useEffect(() => {
    if (!open || !requestedId) return;
    // Sync the tapped post (and a fresh drag offset) into the sheet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShownId(requestedId);
    setDragY(0);

    if (initialPost && initialPost.id === requestedId) {
      setPost(initialPost);
      fetchPost(requestedId, true);
    } else {
      setPost(null);
      fetchPost(requestedId, false);
    }
    // Render the real route in the background so a reload/share serves it.
    router.prefetch(`/mo/${requestedId}`);
  }, [open, requestedId, initialPost, fetchPost, router]);

  // Lock the page behind the sheet without losing the scroll position.
  useEffect(() => {
    if (!visible) return;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevOverscroll = body.style.overscrollBehavior;
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    return () => {
      body.style.overflow = prevOverflow;
      body.style.overscrollBehavior = prevOverscroll;
    };
  }, [visible]);

  // Escape closes too, matching the desktop drawer.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // --- Drag down to dismiss --------------------------------------------------
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ startY: 0, startTime: 0, active: false, offset: 0 });
  // rAF-throttled so the sheet never lags behind the finger.
  const dragFrame = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    const scroller = e.currentTarget.parentElement?.querySelector("[data-sheet-scroll]");
    if (scroller && scroller.scrollTop > 0) return;
    drag.current = { startY: e.touches[0].clientY, startTime: performance.now(), active: true, offset: 0 };
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!drag.current.active) return;
    const delta = Math.max(0, e.touches[0].clientY - drag.current.startY);
    cancelAnimationFrame(dragFrame.current);
    dragFrame.current = requestAnimationFrame(() => {
      drag.current.offset = delta;
      setDragY(delta);
    });
  };

  const onTouchEnd = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
    const elapsed = Math.max(performance.now() - drag.current.startTime, 1);
    const velocity = drag.current.offset / elapsed;
    if (
      drag.current.offset > DISMISS_DISTANCE ||
      (drag.current.offset > 24 && velocity > DISMISS_VELOCITY)
    ) {
      onClose();
      return;
    }
    setDragY(0);
  };

  useEffect(() => () => cancelAnimationFrame(dragFrame.current), []);

  if (!portalReady || !mounted) return null;

  const translate = !visible ? "translateY(100%)" : `translateY(${dragY}px)`;

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        style={{
          opacity: visible ? Math.max(0, 1 - dragY / 420) : 0,
          transition: dragging ? "none" : `opacity ${DURATION}ms ease-out`,
        }}
      />

      <div
        aria-label="动态详情"
        aria-hidden={!visible}
        onTransitionEnd={onTransitionEnd}
        style={{
          top: PEEK,
          transform: translate,
          // Follow the finger 1:1 while dragging; ease into place otherwise.
          transition: dragging ? "none" : `transform ${DURATION}ms cubic-bezier(0.32,0.72,0,1)`,
        }}
        className="absolute inset-x-0 bottom-0 flex flex-col bg-card rounded-t-2xl border-t border-border shadow-[0_-8px_40px_rgba(0,0,0,0.18)] overflow-hidden"
      >
        {/* Grab handle + header, fixed above the scrolling content */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          className="shrink-0 touch-none"
        >
          <div className="flex justify-center pt-2 pb-1">
            <span className="h-1 w-9 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="flex items-center justify-between px-3 pb-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="返回"
              tabIndex={visible ? undefined : -1}
              className="inline-flex items-center gap-1 h-8 px-2 -ml-2 rounded-lg text-sm text-foreground active:bg-muted transition-colors cursor-pointer"
            >
              <ArrowLeft size={18} />
              <span>返回</span>
            </button>
            <span className="text-xs font-medium text-muted-foreground">日志详情</span>
            {shownId ? (
              <a
                href={`/mo/${shownId}`}
                aria-label="新窗口打开"
                tabIndex={visible ? undefined : -1}
                className="size-8 flex items-center justify-center -mr-2 rounded-lg text-muted-foreground active:bg-muted transition-colors"
              >
                <ExternalLink size={16} />
              </a>
            ) : (
              <span className="size-8 -mr-2" />
            )}
          </div>
          <div className="h-px bg-border/60" />
        </div>

        <div data-sheet-scroll className="flex-1 overflow-y-auto overscroll-contain pb-20">
          {loading && !post ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-xs">加载详情中...</span>
            </div>
          ) : error && !post ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground px-4 text-center">
              <p className="text-sm">{error}</p>
              {shownId && (
                <button
                  type="button"
                  onClick={() => fetchPost(shownId)}
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
                if (shownId) fetchPost(shownId, true);
                onRefreshParent();
              }}
              isDetailsView={true}
              onRequireLogin={onRequireLogin}
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

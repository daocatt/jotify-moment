"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PanelRightClose, X, Rocket, Plus, MessageSquare, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePresence } from "@/lib/use-presence";
import { ProductCard, type ProductShowcaseMeta } from "@/components/product-card";
import type { PostData } from "@/components/timeline-shell";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

export interface PortfolioDrawerProps {
  isOpen: boolean;
  products: PostData[];
  ownerName: string;
  isOwnPage: boolean;
  onClose: () => void;
  onPublishProduct: () => void;
  onSelectPost: (post: PostData) => void;
}

export function PortfolioDrawer({
  isOpen,
  products,
  ownerName,
  isOwnPage,
  onClose,
  onPublishProduct,
  onSelectPost,
}: PortfolioDrawerProps) {
  // Portalled for the same reason as the details drawer: the sliding transform
  // must not be part of the timeline column's layout.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal needs a DOM target, unavailable during SSR
    setPortalReady(true);
  }, []);

  const { mounted, visible, onTransitionEnd } = usePresence(isOpen, 340);
  if (!portalReady || !mounted) return null;

  const renderContent = () => {
    if (products.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <div className="size-14 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-3 shadow-xs">
            <Rocket size={24} />
          </div>
          <h3 className="text-sm font-medium text-foreground">暂无发布的作品或 AI 助理</h3>
          <p className="text-xs text-muted-foreground max-w-xs mt-1 leading-relaxed">
            这里将展示作者敏捷孵化的 Vibe Coding 项目、独立产品或 AI Agent。
          </p>
          {isOwnPage && (
            <Button
              size="sm"
              onClick={() => {
                onPublishProduct();
              }}
              className="mt-4 h-8 text-xs rounded-lg gap-1.5"
            >
              <Plus size={13} />
              发布第一个作品 / AI 助理
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="p-4 space-y-3.5 pb-20">
        {products.map((post) => {
          const meta = (post.embedMeta || {}) as unknown as ProductShowcaseMeta;
          const defaultText = meta.name && meta.tagline ? `${meta.name} - ${meta.tagline}` : "";
          const hasExtraNote = post.content && post.content.trim() !== defaultText.trim();

          return (
            <div key={post.id} className="space-y-2">
              <ProductCard
                meta={meta}
                onClick={() => onSelectPost(post)}
              />
              <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center gap-1 shrink-0">
                    <Calendar size={11} className="opacity-70" />
                    {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: zhCN })}
                  </span>
                  {hasExtraNote && (
                    <span className="truncate text-muted-foreground/80">
                      · {post.content}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onSelectPost(post)}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer ml-2"
                >
                  <MessageSquare size={11} />
                  <span>详情{post.comments.length > 0 ? ` (${post.comments.length})` : ""}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return createPortal(
    <>
      {/* Desktop Side Drawer (lg and above) */}
      <aside
        aria-label="作品集抽屉"
        aria-hidden={!visible}
        onTransitionEnd={onTransitionEnd}
        style={{
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 320ms cubic-bezier(0.32,0.72,0,1), opacity 320ms ease-out",
          willChange: "transform",
        }}
        className={`hidden lg:flex flex-col fixed top-6 right-[max(0px,calc((100vw-var(--detail-column-width,576px))/2-var(--detail-gutter,16px)))] z-40 w-[480px] xl:w-[540px] max-h-[calc(100vh-1.5rem)] bg-card border-y border-l border-border shadow-2xl rounded-l-xl overflow-hidden ${
          visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-background/85 backdrop-blur-md z-20 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="收回作品集"
              title="收回作品集 (Esc)"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer group shrink-0"
            >
              <PanelRightClose className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              <span>收回</span>
            </button>
            <div className="flex items-center gap-1.5 min-w-0 ml-1">
              <Rocket className="size-3.5 text-orange-500 shrink-0" />
              <span className="font-semibold text-sm text-foreground truncate">
                {ownerName} 的作品集
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                ({products.length})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isOwnPage && (
              <Button
                size="sm"
                variant="outline"
                onClick={onPublishProduct}
                className="h-7 px-2.5 text-xs rounded-full gap-1 cursor-pointer"
              >
                <Plus size={12} />
                发布作品
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              title="关闭 (Esc)"
              className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {renderContent()}
        </div>
      </aside>

      {/* Mobile Bottom Sheet Drawer (below lg) */}
      <div
        className={`fixed inset-0 z-50 lg:hidden flex flex-col justify-end transition-all duration-[300ms] ease-out ${
          visible ? "bg-black/50 backdrop-blur-xs opacity-100" : "bg-black/0 opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      >
        <div
          style={{ transition: "transform 300ms cubic-bezier(0.32,0.72,0,1)", transform: visible ? "translateY(0)" : "translateY(100%)" }}
          className="w-full max-h-[85vh] bg-card rounded-t-2xl border-t border-border shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-background/90 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <Rocket className="size-4 text-orange-500 shrink-0" />
              <span className="font-semibold text-sm text-foreground truncate">
                {ownerName} 的作品集
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                ({products.length})
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isOwnPage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onPublishProduct}
                  className="h-7 px-2.5 text-xs rounded-full gap-1"
                >
                  <Plus size={12} />
                  发布作品
                </Button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {renderContent()}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

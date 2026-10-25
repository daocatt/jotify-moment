"use client";

import { PanelRightClose, X, Rocket, Plus, MessageSquare, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  if (!isOpen) return null;

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

  return (
    <>
      {/* Desktop Side Drawer (lg and above) */}
      <aside
        aria-label="作品集抽屉"
        className="hidden lg:flex flex-col w-[480px] xl:w-[540px] bg-card border-x border-border shadow-2xl sm:mt-6 sm:rounded-t-xl sm:border-t min-h-[calc(100vh-1.5rem)] sticky top-6 max-h-[calc(100vh-1.5rem)] overflow-hidden transition-all duration-300 ease-out z-10 shrink-0"
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
        className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-black/50 backdrop-blur-xs"
        onClick={onClose}
      >
        <div
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
    </>
  );
}

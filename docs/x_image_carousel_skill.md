---
name: x-image-carousel
description: Implement an X.com (Twitter) style smooth horizontal image carousel with dynamic multi-segment progress indicator bar, aspect-ratio preserved height matching, and lightbox support.
---

# X.com 风格横向图片轮播与动态进度指示器 (Image Carousel Skill)

本 Skill 提炼自 X.com (Twitter) 的横向图片轮播交互设计，专注于提供**极度顺滑的横向图片滑动体验**以及**与滑动联动的多段平滑进度指示器**。

---

## 1. 核心设计规范与特点

1. **多段平滑指示器 (Dynamic Progress Indicator)**：
   - 放置在图片列表**正上方**（不遮挡图片内容）。
   - 总段数等于图片数量。
   - **X.com 动画规律**：
     - 当前选中的指示条宽度最长（如 `24px`），未激活的为小短点（如 `7px`）。
     - 当从第 $i$ 张滑向第 $i+1$ 张时，第 $i$ 个指示条从 `24px` 实时线性收缩至 `7px`，第 $i+1$ 个指示条从 `7px` 实时变长至 `24px`。
     - 其余未滑动到的指示条保持 `7px` 不动。
     - 向左回滑时完全对称反向过渡。
2. **图片自适应与排版**：
   - **高度统一**（例如移动端 `260px`，桌面端 `320px`），避免纵向排版错乱。
   - **宽度根据原图比例自适应**（`w-auto`，配合 `object-cover`），保留真实画幅。
   - 图片与图片之间有精致间距（如 `gap-2`），卡片带圆角（`rounded-xl`）。
3. **交互与操作**：
   - 支持移动端惯性手势滑动、触控板横滑、鼠标拖拽。
   - 桌面端悬停时提供左右翻页小按钮（`<` 与 `>`），点击顺滑平移。
   - 点击任意单张图片，唤起全屏 **Lightbox** 大图预览并定位至该图片索引。

---

## 2. 完整 React / Next.js 组件实现

可在项目中创建 `components/image-carousel.tsx`：

```tsx
"use client";

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface CarouselImage {
  url: string;
  thumbnailUrl?: string;
  name?: string;
}

interface ImageCarouselProps {
  images: CarouselImage[];
  onOpenLightbox: (images: string[], index: number) => void;
  className?: string;
}

export const ImageCarousel = memo(function ImageCarousel({
  images,
  onOpenLightbox,
  className = "",
}: ImageCarouselProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0); // 连续浮点数: 0 到 images.length - 1
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(images.length > 1);
  const [isHovered, setIsHovered] = useState(false);
  const isScrollingRef = useRef(false);

  const imageUrls = images.map((img) => img.url);

  // 监听容器滚动，计算精确的浮点滑动进度
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || images.length <= 1) {
      setScrollProgress(0);
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScrollLeft = scrollWidth - clientWidth;

    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft < maxScrollLeft - 4);

    if (maxScrollLeft <= 0) {
      setScrollProgress(0);
      return;
    }

    const children = Array.from(el.children) as HTMLElement[];
    if (!children.length) return;

    let activeProgress = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childLeft = child.offsetLeft;
      const childWidth = child.offsetWidth;
      const nextChild = children[i + 1];

      // 当前子项到下一个子项的实际位移跨度（含 gap）
      const span = nextChild ? nextChild.offsetLeft - childLeft : childWidth;

      if (i === children.length - 1) {
        if (scrollLeft >= childLeft - 10) {
          activeProgress = i;
          break;
        }
      } else if (scrollLeft >= childLeft && scrollLeft < childLeft + span) {
        const fraction = (scrollLeft - childLeft) / (span || 1);
        activeProgress = i + fraction;
        break;
      }
    }

    const clamped = Math.max(0, Math.min(images.length - 1, activeProgress));
    setScrollProgress(clamped);
  }, [images.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScrollThrottled = () => {
      if (!isScrollingRef.current) {
        isScrollingRef.current = true;
        requestAnimationFrame(() => {
          handleScroll();
          isScrollingRef.current = false;
        });
      }
    };

    el.addEventListener("scroll", onScrollThrottled, { passive: true });
    handleScroll();

    const resizeObserver = new ResizeObserver(() => {
      handleScroll();
    });
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", onScrollThrottled);
      resizeObserver.disconnect();
    };
  }, [handleScroll]);

  const scrollToDirection = (direction: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;

    const scrollAmount = el.clientWidth * 0.75;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <div
      className={`space-y-1.5 mt-2 select-none ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 1. 顶部指示器：置于图片上方，根据总张数动态计算长度与高亮 */}
      {images.length > 1 && (
        <div className="flex items-center gap-1 py-0.5 pointer-events-none">
          {images.map((_, idx) => {
            const floor = Math.floor(scrollProgress);
            const ceil = Math.min(images.length - 1, floor + 1);
            const fraction = scrollProgress - floor; // 0 ~ 1

            let currentWidth = 7; // 默认未选中宽度 7px
            let isCurrentOrNext = false;

            if (idx === floor) {
              // 离开当前卡片：24px -> 7px
              currentWidth = 24 - fraction * (24 - 7);
              isCurrentOrNext = true;
            } else if (idx === ceil) {
              // 滑入目标卡片：7px -> 24px
              currentWidth = 7 + fraction * (24 - 7);
              isCurrentOrNext = true;
            }

            const isHighlit = Math.abs(scrollProgress - idx) < 0.5;

            return (
              <div
                key={idx}
                className="h-1 rounded-full overflow-hidden transition-colors duration-200"
                style={{
                  width: `${currentWidth}px`,
                  backgroundColor: isCurrentOrNext
                    ? isHighlit
                      ? "rgba(120, 120, 120, 0.9)"
                      : "rgba(150, 150, 150, 0.5)"
                    : "rgba(180, 180, 180, 0.35)",
                }}
              />
            );
          })}
        </div>
      )}

      {/* 2. 图片视口容器 */}
      <div className="relative group rounded-2xl overflow-hidden">
        {/* 桌面端左右平滑翻页按钮 */}
        {images.length > 1 && isHovered && (
          <>
            {canScrollLeft && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  scrollToDirection("left");
                }}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 size-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm transition-all duration-150 shadow-md cursor-pointer focus:outline-none"
                aria-label="Previous image"
              >
                <ChevronLeft size={18} />
              </button>
            )}

            {canScrollRight && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  scrollToDirection("right");
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 size-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm transition-all duration-150 shadow-md cursor-pointer focus:outline-none"
                aria-label="Next image"
              >
                <ChevronRight size={18} />
              </button>
            )}
          </>
        )}

        {/* 3. 横向滚动轨道 */}
        <div
          ref={containerRef}
          className="flex gap-2 overflow-x-auto scrollbar-none snap-x snap-mandatory rounded-2xl scroll-smooth"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {images.map((img, idx) => (
            <div
              key={idx}
              onClick={() => onOpenLightbox(imageUrls, idx)}
              onContextMenu={(e) => e.preventDefault()}
              className="relative shrink-0 snap-start h-[260px] sm:h-[320px] max-w-[85vw] sm:max-w-[420px] min-w-[140px] rounded-xl overflow-hidden bg-muted border border-border/60 cursor-zoom-in group/img transition-transform active:scale-[0.99]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.thumbnailUrl || img.url}
                alt={img.name || `Image ${idx + 1}`}
                className="h-full w-auto max-w-none object-cover rounded-xl transition-opacity duration-200"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
```

---

## 3. 使用方法与示例

### 基本使用
```tsx
import { ImageCarousel } from "@/components/image-carousel";

export function PostItem({ post, onOpenLightbox }) {
  const images = [
    { url: "https://example.com/img1.jpg", thumbnailUrl: "https://example.com/thumb1.jpg" },
    { url: "https://example.com/img2.jpg", thumbnailUrl: "https://example.com/thumb2.jpg" },
    { url: "https://example.com/img3.jpg", thumbnailUrl: "https://example.com/thumb3.jpg" },
  ];

  return (
    <div className="card">
      <p>{post.content}</p>
      <ImageCarousel images={images} onOpenLightbox={onOpenLightbox} />
    </div>
  );
}
```

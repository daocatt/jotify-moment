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
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(images.length > 1);
  const [isHovered, setIsHovered] = useState(false);

  const imageUrls = images.map((img) => img.url);

  // Only the edge booleans live here (same-value setState bails out, so
  // per-scroll-frame calls are free until an edge is actually crossed).
  // The continuous scroll progress lives inside CarouselIndicators —
  // keeping it here would re-render the whole image track every frame.
  const updateEdges = useCallback(() => {
    const el = containerRef.current;
    if (!el || images.length <= 1) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScrollLeft = scrollWidth - clientWidth;

    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(maxScrollLeft > 0 && scrollLeft < maxScrollLeft - 4);
  }, [images.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || images.length <= 1) return;

    let ticking = false;
    const onScrollThrottled = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateEdges();
        ticking = false;
      });
    };

    el.addEventListener("scroll", onScrollThrottled, { passive: true });
    updateEdges();

    const resizeObserver = new ResizeObserver(onScrollThrottled);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", onScrollThrottled);
      resizeObserver.disconnect();
    };
  }, [updateEdges, images.length]);

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
      {/* Top Indicators: Placed above the images (below the author name/text), not overlapping pictures */}
      <CarouselIndicators count={images.length} containerRef={containerRef} />

      {/* Image Viewport Container */}
      <div className="relative group rounded-2xl overflow-hidden">
        {/* Desktop Navigation Buttons (Left/Right) */}
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

        {/* Scrollable Image Track */}
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

/**
 * X.com-style progress dots for the carousel. Owns the continuous scroll
 * position so its high-frequency updates re-render only these dots, never
 * the carousel's image track.
 */
function CarouselIndicators({
  count,
  containerRef,
}: {
  count: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [scrollProgress, setScrollProgress] = useState(0); // continuous float 0 to count - 1

  useEffect(() => {
    const el = containerRef.current;
    if (!el || count <= 1) return;

    let ticking = false;
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const maxScrollLeft = scrollWidth - clientWidth;
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

        // Distance from this child's start to the next child's start
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

      setScrollProgress(Math.max(0, Math.min(count - 1, activeProgress)));
    };

    const onScrollThrottled = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    };

    el.addEventListener("scroll", onScrollThrottled, { passive: true });
    update();

    const resizeObserver = new ResizeObserver(onScrollThrottled);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", onScrollThrottled);
      resizeObserver.disconnect();
    };
  }, [count, containerRef]);

  if (count <= 1) return null;

  return (
    <div className="flex items-center gap-1 py-0.5 pointer-events-none">
      {Array.from({ length: count }, (_, idx) => {
        // Selected length: 24px (w-6); Inactive length: 7px (w-1.5);
        // As we scroll between floor and ceil:
        // idx === floor -> transitions from 24px down to 7px
        // idx === ceil  -> transitions from 7px up to 24px
        // Other items remain 7px (w-1.5)
        const floor = Math.floor(scrollProgress);
        const ceil = Math.min(count - 1, floor + 1);
        const fraction = scrollProgress - floor; // 0 to 1

        let currentWidth = 7; // base inactive width
        let isCurrentOrNext = false;

        if (idx === floor) {
          // Sliding away from floor towards ceil: decreases from 24 to 7
          currentWidth = 24 - fraction * (24 - 7);
          isCurrentOrNext = true;
        } else if (idx === ceil) {
          // Sliding towards ceil: increases from 7 to 24
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
  );
}

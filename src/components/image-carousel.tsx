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
  const [scrollProgress, setScrollProgress] = useState(0); // 0 to images.length - 1
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(images.length > 1);
  const [isHovered, setIsHovered] = useState(false);
  const isScrollingRef = useRef(false);

  const imageUrls = images.map((img) => img.url);

  // Update progress bar based on horizontal scroll position
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScrollLeft = scrollWidth - clientWidth;

    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft < maxScrollLeft - 4);

    if (maxScrollLeft <= 0 || images.length <= 1) {
      setScrollProgress(0);
      return;
    }

    // Determine current item index / smooth floating progress
    const children = Array.from(el.children) as HTMLElement[];
    if (!children.length) return;

    let activeProgress = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childLeft = child.offsetLeft;
      const childWidth = child.offsetWidth;
      const childRight = childLeft + childWidth;

      if (scrollLeft >= childLeft && scrollLeft <= childRight) {
        const itemFraction = (scrollLeft - childLeft) / (childWidth || 1);
        activeProgress = i + itemFraction;
        break;
      } else if (scrollLeft < childLeft && i === 0) {
        activeProgress = 0;
        break;
      } else if (i === children.length - 1 && scrollLeft >= childLeft) {
        activeProgress = i;
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
    // Initial calculation after mount/layout
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
      className={`relative group rounded-2xl overflow-hidden mt-2 select-none ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Top Left Indicators (X.com style multi-segment progress bar) */}
      {images.length > 1 && (
        <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/40 backdrop-blur-md transition-opacity duration-200 pointer-events-none shadow-sm">
          {images.map((_, idx) => {
            const distance = Math.abs(scrollProgress - idx);
            const isActive = distance < 0.5;

            return (
              <div
                key={idx}
                className={`h-1 rounded-full transition-all duration-300 overflow-hidden ${
                  isActive
                    ? "w-5 bg-white/40"
                    : "w-2.5 bg-white/20"
                }`}
              >
                <div
                  className="h-full bg-white rounded-full transition-all duration-150"
                  style={{
                    width: isActive ? `${Math.max(20, Math.min(100, (1 - distance) * 100))}%` : scrollProgress > idx ? "100%" : "0%",
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

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
  );
});

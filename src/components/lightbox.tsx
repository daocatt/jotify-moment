"use client";

import { useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface LightboxProps {
  images: string[];
  activeIndex: number;
  onClose: () => void;
  onChange: (index: number) => void;
}

export function Lightbox({ images, activeIndex, onClose, onChange }: LightboxProps) {
  const handlePrev = useCallback(() => {
    if (activeIndex > 0) {
      onChange(activeIndex - 1);
    } else {
      onChange(images.length - 1);
    }
  }, [activeIndex, images.length, onChange]);

  const handleNext = useCallback(() => {
    if (activeIndex < images.length - 1) {
      onChange(activeIndex + 1);
    } else {
      onChange(0);
    }
  }, [activeIndex, images.length, onChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };

    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose, handlePrev, handleNext]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[85vh] px-4 flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img
          src={images[activeIndex]}
          alt={`Image ${activeIndex + 1}`}
          className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl pointer-events-none"
        />

        {images.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              className="absolute left-6 text-white/70 hover:text-white bg-black/30 hover:bg-black/50 p-2 rounded-full transition-all"
            >
              <ChevronLeft size={36} />
            </button>
            <button
              onClick={handleNext}
              className="absolute right-6 text-white/70 hover:text-white bg-black/30 hover:bg-black/50 p-2 rounded-full transition-all"
            >
              <ChevronRight size={36} />
            </button>
          </>
        )}
      </div>

      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-white/70 hover:text-white bg-black/30 hover:bg-black/50 p-2 rounded-full transition-all"
      >
        <X size={24} />
      </button>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-sm">
        {activeIndex + 1} / {images.length}
      </div>
    </div>
  );
}

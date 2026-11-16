import * as React from "react";
import { cn } from "@/lib/utils";

interface MomentSkeletonProps {
  count?: number;
  className?: string;
  isDetailsView?: boolean;
}

export function MomentSkeleton({
  count = 1,
  className,
  isDetailsView = false,
}: MomentSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <div className={cn("divide-y divide-border/60", className)}>
      {items.map((idx) => {
        // Vary the skeleton layout slightly across multiple items to mimic real timeline variety
        const hasMedia = idx % 2 === 0;
        const mediaCount = (idx % 3) + 1;

        return (
          <article
            key={idx}
            className="flex gap-3 sm:gap-4 p-4 text-sm relative animate-pulse select-none"
            aria-hidden="true"
          >
            {/* Avatar skeleton */}
            <div className="size-10 rounded-md bg-muted/80 dark:bg-muted/50 shrink-0" />

            {/* Post body */}
            <div className="flex-1 min-w-0 space-y-2.5">
              {/* Author name & time line */}
              <div className="flex items-baseline justify-between pt-0.5">
                <div className="h-4 bg-muted/80 dark:bg-muted/50 rounded-xs w-24 sm:w-28" />
                <div className="h-3 bg-muted/60 dark:bg-muted/40 rounded-xs w-12" />
              </div>

              {/* Text content lines */}
              <div className="space-y-1.5 py-0.5">
                <div className="h-3.5 bg-muted/70 dark:bg-muted/40 rounded-xs w-full" />
                <div className="h-3.5 bg-muted/70 dark:bg-muted/40 rounded-xs w-[92%]" />
                {idx % 2 !== 0 && (
                  <div className="h-3.5 bg-muted/60 dark:bg-muted/30 rounded-xs w-[68%]" />
                )}
              </div>

              {/* Photo grid skeleton (simulating real photos) */}
              {hasMedia && (
                <div
                  className={cn(
                    "pt-1",
                    mediaCount === 1
                      ? "max-w-[200px]"
                      : "grid grid-cols-3 gap-1.5 max-w-[280px]"
                  )}
                >
                  {mediaCount === 1 ? (
                    <div className="aspect-[4/3] w-full bg-muted/70 dark:bg-muted/40 rounded-md" />
                  ) : (
                    Array.from({ length: 3 }).map((_, mIdx) => (
                      <div
                        key={mIdx}
                        className="aspect-square bg-muted/70 dark:bg-muted/40 rounded-md"
                      />
                    ))
                  )}
                </div>
              )}

              {/* Bottom meta bar: timestamp placeholder and action buttons */}
              {!isDetailsView && (
                <div className="flex items-center justify-between pt-2">
                  <div className="h-3 bg-muted/50 dark:bg-muted/30 rounded-xs w-16" />
                  <div className="flex items-center gap-1.5">
                    <div className="size-6 rounded-md bg-muted/40 dark:bg-muted/20" />
                    <div className="size-6 rounded-md bg-muted/40 dark:bg-muted/20" />
                  </div>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

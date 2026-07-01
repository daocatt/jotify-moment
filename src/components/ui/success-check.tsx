"use client";

import { useEffect, useRef } from "react";

interface SuccessCheckProps {
  show: boolean;
  size?: number;
  className?: string;
}

export function SuccessCheck({ show, size = 20, className }: SuccessCheckProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (show) {
      el.setAttribute("data-state", "out");
      void el.offsetWidth;
      el.setAttribute("data-state", "in");
    } else {
      el.setAttribute("data-state", "out");
    }
  }, [show]);

  return (
    <span ref={ref} className={`t-success-check ${className || ""}`} data-state="out" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" width={size} height={size}>
        <path
          d="M12 24L20 32L36 16"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

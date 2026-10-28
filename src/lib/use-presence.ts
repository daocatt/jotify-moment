"use client";

import { useCallback, useEffect, useRef, useState, type TransitionEvent } from "react";

/**
 * Two-phase mount state for enter/exit transitions.
 *
 * A panel driven by a single boolean cannot animate its exit: the boolean flips
 * and React unmounts the node in the same commit, before the CSS transition can
 * run. This hook keeps the node mounted until the exit transition reports done,
 * or until a safety timeout fires (e.g. the node is inside a hidden ancestor, or
 * the browser skips the transition because the tab is in the background).
 *
 * `onExited` runs exactly once per exit, before the node unmounts, so callers can
 * pop history or navigate at the moment the animation finishes.
 */
export function usePresence(open: boolean, exitMs = 320, onExited?: () => void) {
  const [mounted, setMounted] = useState(open);
  // `visible` is applied after mount so the browser has a "from" style to
  // transition out of.
  const [visible, setVisible] = useState(open);
  const exitingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExitedRef = useRef(onExited);

  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finishExit = useCallback(() => {
    if (!exitingRef.current) return;
    exitingRef.current = false;
    clearTimer();
    setMounted(false);
    onExitedRef.current?.();
  }, [clearTimer]);

  useEffect(() => {
    if (!open) return;
    clearTimer();
    exitingRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-on-open is the point of this hook
    setMounted(true);
    // Two frames: one to commit the "from" style, one to flip it so the
    // transition actually runs (a single rAF can land in the same style pass).
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open, clearTimer]);

  useEffect(() => {
    if (open || !mounted) return;
    exitingRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the exit transition
    setVisible(false);
    timerRef.current = setTimeout(finishExit, exitMs);
    return clearTimer;
  }, [open, mounted, exitMs, finishExit, clearTimer]);

  /** Attach to the animated node: `onTransitionEnd` shortens the exit to the real duration. */
  const onTransitionEnd = useCallback(
    (e: TransitionEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.propertyName === "transform" || e.propertyName === "opacity") finishExit();
    },
    [finishExit]
  );

  return { mounted, visible, onTransitionEnd };
}

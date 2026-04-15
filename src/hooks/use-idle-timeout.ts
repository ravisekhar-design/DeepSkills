"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export const IDLE_TIMEOUT_MS  = 30 * 60 * 1000; // 30 min → auto-logout
export const WARN_BEFORE_MS   =  2 * 60 * 1000; //  2 min warning before logout

const ACTIVITY_EVENTS = [
  "mousemove", "mousedown", "keydown",
  "touchstart", "scroll", "click",
] as const;

export function useIdleTimeout(
  onTimeout: () => void,
  enabled:   boolean,
) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown,   setCountdown]   = useState(WARN_BEFORE_MS / 1000);

  // Single mutable ref — avoids stale-closure issues with timers
  const r = useRef({
    idleTimer:    null as ReturnType<typeof setTimeout>  | null,
    warnTimer:    null as ReturnType<typeof setTimeout>  | null,
    countTick:    null as ReturnType<typeof setInterval> | null,
    lastActivity: Date.now(),
    onTimeout,          // kept current below
    enabled,            // kept current below
  });

  // Always keep latest callback + flag without causing effect re-runs
  r.current.onTimeout = onTimeout;
  r.current.enabled   = enabled;

  // ── Clear all timers ──────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    if (r.current.idleTimer)  clearTimeout(r.current.idleTimer);
    if (r.current.warnTimer)  clearTimeout(r.current.warnTimer);
    if (r.current.countTick)  clearInterval(r.current.countTick);
    r.current.idleTimer = null;
    r.current.warnTimer = null;
    r.current.countTick = null;
  }, []);

  // ── (Re)start timers from now ─────────────────────────────────────────
  const startTimers = useCallback(() => {
    clearAll();
    if (!r.current.enabled) return;

    r.current.lastActivity = Date.now();

    // Warning fires (IDLE - WARN) ms after last activity
    r.current.warnTimer = setTimeout(() => {
      setShowWarning(true);
      setCountdown(WARN_BEFORE_MS / 1000);
      r.current.countTick = setInterval(
        () => setCountdown(c => Math.max(0, c - 1)),
        1000,
      );
    }, IDLE_TIMEOUT_MS - WARN_BEFORE_MS);

    // Logout fires IDLE_TIMEOUT_MS after last activity
    r.current.idleTimer = setTimeout(() => {
      clearAll();
      setShowWarning(false);
      r.current.onTimeout();
    }, IDLE_TIMEOUT_MS);
  }, [clearAll]);

  // ── Public: reset on "Keep me signed in" ─────────────────────────────
  const resetTimer = useCallback(() => {
    setShowWarning(false);
    setCountdown(WARN_BEFORE_MS / 1000);
    startTimers();
  }, [startTimers]);

  // Stable ref so event listeners always call the latest resetTimer
  const resetRef = useRef(resetTimer);
  resetRef.current = resetTimer;

  // ── Register / deregister activity listeners ──────────────────────────
  useEffect(() => {
    if (!enabled) {
      clearAll();
      setShowWarning(false);
      return;
    }

    startTimers();

    // Any user interaction → reset the idle clock
    const onActivity = () => {
      if (r.current.enabled) resetRef.current();
    };

    // Tab becomes visible again after being hidden — check elapsed time
    const onVisibility = () => {
      if (!document.hidden && r.current.enabled) {
        const elapsed = Date.now() - r.current.lastActivity;
        if (elapsed >= IDLE_TIMEOUT_MS) {
          clearAll();
          setShowWarning(false);
          r.current.onTimeout();
        }
      }
    };

    ACTIVITY_EVENTS.forEach(e =>
      document.addEventListener(e, onActivity, { passive: true }),
    );
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      ACTIVITY_EVENTS.forEach(e =>
        document.removeEventListener(e, onActivity),
      );
      document.removeEventListener("visibilitychange", onVisibility);
      clearAll();
    };
  }, [enabled, startTimers, clearAll]);

  return { showWarning, countdown, resetTimer };
}

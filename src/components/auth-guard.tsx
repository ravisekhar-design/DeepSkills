"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useCallback } from "react";
import { Loader2, Timer, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIdleTimeout, IDLE_TIMEOUT_MS, WARN_BEFORE_MS } from "@/hooks/use-idle-timeout";

// ── Idle warning overlay ──────────────────────────────────────────────────────
function IdleWarning({
  countdown,
  onStay,
  onLeave,
}: {
  countdown: number;
  onStay:    () => void;
  onLeave:   () => void;
}) {
  const mins = Math.floor(countdown / 60);
  const secs = String(countdown % 60).padStart(2, "0");
  const urgent = countdown <= 30;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-background border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-300">

        {/* Header stripe */}
        <div className={`h-1.5 w-full transition-colors ${urgent ? "bg-destructive" : "bg-amber-500"}`} />

        <div className="p-6 space-y-5">
          {/* Icon + title */}
          <div className="flex items-start gap-4">
            <div className={`shrink-0 flex h-11 w-11 items-center justify-center rounded-full border ${urgent ? "bg-destructive/10 border-destructive/30" : "bg-amber-500/10 border-amber-500/30"}`}>
              {urgent
                ? <ShieldAlert className="h-5 w-5 text-destructive" />
                : <Timer className="h-5 w-5 text-amber-500" />
              }
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">Session expiring soon</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You&apos;ve been inactive for {Math.round((IDLE_TIMEOUT_MS - WARN_BEFORE_MS) / 60000)} minutes.
              </p>
            </div>
          </div>

          {/* Countdown */}
          <div className="flex flex-col items-center py-2 space-y-1">
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
              Auto sign-out in
            </span>
            <span className={`text-5xl font-mono font-bold tabular-nums transition-colors ${urgent ? "text-destructive" : "text-foreground"}`}>
              {mins}:{secs}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-10 text-sm"
              onClick={onLeave}
            >
              Sign out
            </Button>
            <Button
              className="flex-1 h-10 text-sm gradient-copper font-semibold shadow-lg shadow-accent/20"
              onClick={onStay}
            >
              Stay signed in
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AuthGuard ─────────────────────────────────────────────────────────────────
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pathname   = usePathname();
  const router     = useRouter();

  const isAuthPage     = pathname === "/login" || pathname === "/register";
  const isAuthenticated = status === "authenticated";

  // Redirect unauthenticated users away from protected pages
  useEffect(() => {
    if (status === "unauthenticated" && !isAuthPage) {
      router.push("/login");
    } else if (status === "authenticated" && isAuthPage) {
      router.push("/");
    }
  }, [status, pathname, router, isAuthPage]);

  // ── Idle timeout ──────────────────────────────────────────────────────
  const handleTimeout = useCallback(async () => {
    // signOut with callbackUrl triggers a full redirect after clearing the session
    await signOut({ callbackUrl: "/login?reason=timeout", redirect: true });
  }, []);

  const { showWarning, countdown, resetTimer } = useIdleTimeout(
    handleTimeout,
    isAuthenticated && !isAuthPage,
  );

  // ── Loading state ─────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 text-accent animate-spin" />
        <p className="text-muted-foreground mt-4 font-mono text-sm">Authenticating session...</p>
      </div>
    );
  }

  if (status === "unauthenticated" && !isAuthPage) {
    return null;
  }

  return (
    <>
      {children}

      {/* Idle-timeout warning — rendered above everything else */}
      {showWarning && (
        <IdleWarning
          countdown={countdown}
          onStay={resetTimer}
          onLeave={handleTimeout}
        />
      )}
    </>
  );
}

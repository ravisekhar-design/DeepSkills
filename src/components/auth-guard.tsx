"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const isAuthPage = pathname === "/login" || pathname === "/register";

  useEffect(() => {
    if (status === "unauthenticated" && !isAuthPage) {
      router.push("/login");
    } else if (status === "authenticated" && isAuthPage) {
      router.push("/");
    }
  }, [status, pathname, router, isAuthPage]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 text-accent animate-spin" />
        <p className="text-muted-foreground mt-4 font-mono text-sm">Authenticating session...</p>
      </div>
    );
  }

  // If unauthenticated and not on an auth page, render nothing until they get redirected
  if (status === "unauthenticated" && !isAuthPage) {
    return null;
  }

  return <>{children}</>;
}

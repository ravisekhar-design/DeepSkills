"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";
import { AuthGuard } from "@/components/auth-guard";
import { QueryProvider } from "@/components/providers/query-provider";
import { ErrorBoundary } from "@/components/error-boundary";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
            <AuthProvider>
                <QueryProvider>
                    <AuthGuard>
                        <SidebarProvider>
                            <ErrorBoundary>
                                {children}
                            </ErrorBoundary>
                            <Toaster />
                        </SidebarProvider>
                    </AuthGuard>
                </QueryProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

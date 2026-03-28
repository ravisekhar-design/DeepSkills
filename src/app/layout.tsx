import type { Metadata } from 'next';
import './globals.css';
import { Providers } from "@/components/providers";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

export const metadata: Metadata = {
  title: 'DeepSkill Nexus',
  description: 'Advanced AI Agent Management and Skill Integration Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="DeepSkills" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground">
        <Providers>
          <AppSidebar />
          <SidebarInset className="flex flex-col h-[100dvh] overflow-hidden">
            <div className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-border bg-sidebar/30 backdrop-blur-md md:hidden sticky top-0 z-40">
              <SidebarTrigger className="bg-sidebar shadow-lg border border-border" />
              <span className="font-bold text-sm tracking-tight">DeepSkills</span>
            </div>
            <main className="flex-1 overflow-auto bg-background min-h-0">
              {children}
            </main>
          </SidebarInset>
        </Providers>
      </body>
    </html>
  );
}

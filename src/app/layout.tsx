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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground">
        <Providers>
          <AppSidebar />
          <SidebarInset className="relative">
            <div className="absolute top-4 left-4 z-50 md:hidden">
              <SidebarTrigger className="bg-sidebar shadow-lg border border-border" />
            </div>
            <main className="flex-1 overflow-auto bg-background">
              {children}
            </main>
          </SidebarInset>
        </Providers>
      </body>
    </html>
  );
}

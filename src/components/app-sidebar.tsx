
"use client";

import {
  LayoutDashboard,
  Users,
  Zap,
  MessageSquare,
  Settings,
  Building2,
  LogOut,
  LogIn,
  User as UserIcon,
  Hexagon
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUser, useAuth } from "@/firebase/auth/use-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Deep Agents", href: "/agents", icon: Users },
  { name: "Skill Explorer", href: "/skills", icon: Zap },
  { name: "Nexus Chat", href: "/chat", icon: MessageSquare },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const auth = useAuth();

  // Dummy handlers as the local environment assumes operator presence
  const handleSignIn = () => { };
  const handleSignOut = () => { };

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar shadow-xl">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3 px-2 py-3 border border-sidebar-border/40 bg-sidebar-accent/20 rounded-xl group relative">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg gradient-sapphire text-accent shadow-lg shadow-accent/20">
            <Hexagon className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-bold">Personal Lab</span>
            <span className="truncate text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Nexus Operator</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute right-2">
                <ThemeToggle />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              Theme Core Link
            </TooltipContent>
          </Tooltip>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 text-muted-foreground uppercase text-[10px] tracking-widest font-semibold mb-2">
            Nexus Interface
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.name}
                    className="h-11 transition-all duration-300 hover:bg-sidebar-accent group"
                  >
                    <Link href={item.href} className="flex items-center gap-3">
                      <item.icon className={`size-5 transition-colors ${pathname === item.href ? 'text-accent' : 'text-muted-foreground group-hover:text-accent/60'}`} />
                      <span className={`font-medium ${pathname === item.href ? 'text-foreground' : 'text-sidebar-foreground/70'}`}>
                        {item.name}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-4">
        {/* User Profile Area Removed */}

        <div className="p-4 rounded-xl glass-panel text-[10px] text-muted-foreground flex flex-col gap-2 border-accent/10">
          <div className="flex items-center gap-2">
            <div className={`size-2 rounded-full ${user ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-muted'}`} />
            <span className="font-bold tracking-widest uppercase">
              {user ? 'Nexus Core Active' : 'Nexus Core Standby'}
            </span>
          </div>
          <div className="flex justify-between border-t border-border/40 pt-2">
            <span>Uptime: 100%</span>
            <span>v2.5.0</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

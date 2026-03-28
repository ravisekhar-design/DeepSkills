"use client";

import { useSession, signOut as nextAuthSignOut } from "next-auth/react";

// Returns user object extracted from NextAuth session
export function useUser() {
  const { data: session, status } = useSession();
  
  return {
    user: session?.user ? {
      uid: (session.user as any).id || "unknown",
      displayName: session.user.name || "User",
      email: session.user.email,
      photoURL: session.user.image,
    } : null,
    loading: status === "loading"
  };
}

// Map the old Firebase signOut to NextAuth signOut 
export function useAuth() {
  const auth = {
    signOut: () => nextAuthSignOut({ callbackUrl: "/login" })
  };
  return auth;
}

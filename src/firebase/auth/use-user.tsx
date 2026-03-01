"use client";

import React, { createContext, useContext } from 'react';

// A mock User object designed to replace the Firebase Google User object.
const MockLocalUser = {
  uid: 'local-desktop-operator',
  displayName: 'Nexus Operator',
  email: 'nexus@local.network',
  photoURL: null,
};

const AuthContext = createContext<{ user: typeof MockLocalUser | null; loading: boolean }>({
  user: null,
  loading: true
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <AuthContext.Provider value={{ user: MockLocalUser, loading: false }}>
      {children}
    </AuthContext.Provider>
  );
};

// Returns standard static Local user object without connecting to Auth services.
export function useUser() {
  const context = useContext(AuthContext);
  return {
    user: context.user,
    loading: context.loading
  };
}

// Return a dummy auth object to prevent the UI from crashing if it calls signOut
export function useAuth() {
  return {} as any;
}

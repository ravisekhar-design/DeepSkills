'use client';

/**
 * LAYER: Frontend
 * React Query client provider. Configured for enterprise use:
 * - 30 s stale time default (avoids hammer-on-focus refetches)
 * - 3 retries with exponential back-off (max 30 s)
 * - Window-focus refetch disabled for data-heavy pages
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 3,
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 30_000),
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 1,
      },
    },
  });
}

// Singleton on the server, per-render on the client (avoids sharing state between users in SSR)
let browserClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient();
  if (!browserClient) browserClient = makeQueryClient();
  return browserClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // useState ensures the client is created once per component lifecycle on the client
  const [client] = useState(() => getQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

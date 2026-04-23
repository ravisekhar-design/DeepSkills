'use client';

/**
 * LAYER: Frontend
 * React Query hook for agents. Replaces the useCollection(null, 'agents')
 * pattern with proper caching, background refetch, and optimistic mutations.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { agentClientService } from '@/services/agent.service';
import type { Agent } from '@/types/domain';

export const AGENTS_KEY = ['agents'] as const;

export function useAgents(): UseQueryResult<Agent[], Error> {
  return useQuery({
    queryKey: AGENTS_KEY,
    queryFn: () => agentClientService.getAll(),
    staleTime: 30_000,
  });
}

export function useSaveAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agent: Agent) => agentClientService.save(agent),
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentClientService.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: AGENTS_KEY });
      const prev = qc.getQueryData<Agent[]>(AGENTS_KEY);
      qc.setQueryData<Agent[]>(AGENTS_KEY, old => old?.filter(a => a.id !== id) ?? []);
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(AGENTS_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
}

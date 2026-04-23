'use client';

/**
 * LAYER: Frontend
 * React Query hook for skills.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { skillClientService } from '@/services/skill.service';
import type { Skill } from '@/types/domain';

export const SKILLS_KEY = ['skills'] as const;

export function useSkills(): UseQueryResult<Skill[], Error> {
  return useQuery({
    queryKey: SKILLS_KEY,
    queryFn: () => skillClientService.getAll(),
    staleTime: 60_000,
  });
}

export function useSaveSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skill: Skill) => skillClientService.save(skill),
    onSuccess: () => qc.invalidateQueries({ queryKey: SKILLS_KEY }),
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => skillClientService.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: SKILLS_KEY });
      const prev = qc.getQueryData<Skill[]>(SKILLS_KEY);
      qc.setQueryData<Skill[]>(SKILLS_KEY, old => old?.filter(s => s.id !== id) ?? []);
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(SKILLS_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SKILLS_KEY }),
  });
}

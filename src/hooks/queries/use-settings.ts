'use client';

/**
 * LAYER: Frontend
 * React Query hook for system settings. Replaces useDoc().
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { settingsClientService } from '@/services/settings.service';
import type { SystemSettings } from '@/types/domain';
import { DEFAULT_SETTINGS } from '@/lib/store';

export const SETTINGS_KEY = ['settings'] as const;

export function useSettings(): UseQueryResult<SystemSettings, Error> {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const data = await settingsClientService.get();
      return data ?? DEFAULT_SETTINGS;
    },
    staleTime: 60_000,
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: SystemSettings) => settingsClientService.save(settings),
    onMutate: async (settings) => {
      await qc.cancelQueries({ queryKey: SETTINGS_KEY });
      const prev = qc.getQueryData<SystemSettings>(SETTINGS_KEY);
      qc.setQueryData(SETTINGS_KEY, settings);
      return { prev };
    },
    onError: (_err, _settings, ctx) => {
      if (ctx?.prev) qc.setQueryData(SETTINGS_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

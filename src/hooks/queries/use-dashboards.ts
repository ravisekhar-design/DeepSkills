'use client';

/**
 * LAYER: Frontend
 * React Query hooks for dashboards and widgets.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { dashboardClientService } from '@/services/dashboard.service';
import type { Dashboard, DashboardWidget } from '@/types/domain';

export const DASHBOARDS_KEY = ['dashboards'] as const;
export const dashboardKey = (id: string) => ['dashboards', id] as const;

// ── List ─────────────────────────────────────────────────────────────────────

export function useDashboards(): UseQueryResult<Dashboard[], Error> {
  return useQuery({
    queryKey: DASHBOARDS_KEY,
    queryFn: () => dashboardClientService.getAll(),
    staleTime: 30_000,
  });
}

// ── Single dashboard with widgets ────────────────────────────────────────────

export function useDashboard(
  id: string | null,
): UseQueryResult<Dashboard & { widgets: DashboardWidget[] }, Error> {
  return useQuery({
    queryKey: dashboardKey(id ?? ''),
    queryFn: () => dashboardClientService.getById(id!),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => dashboardClientService.create(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: DASHBOARDS_KEY }),
  });
}

// ── Rename ────────────────────────────────────────────────────────────────────

export function useRenameDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      dashboardClientService.rename(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: DASHBOARDS_KEY }),
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dashboardClientService.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: DASHBOARDS_KEY });
      const prev = qc.getQueryData<Dashboard[]>(DASHBOARDS_KEY);
      qc.setQueryData<Dashboard[]>(DASHBOARDS_KEY, old => old?.filter(d => d.id !== id) ?? []);
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(DASHBOARDS_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: DASHBOARDS_KEY }),
  });
}

// ── Widget mutations ──────────────────────────────────────────────────────────

export function useCreateWidget(dashboardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<DashboardWidget>) =>
      dashboardClientService.createWidget(dashboardId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: dashboardKey(dashboardId) }),
  });
}

export function useUpdateWidget(dashboardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ widgetId, data }: { widgetId: string; data: Partial<DashboardWidget> }) =>
      dashboardClientService.updateWidget(dashboardId, widgetId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: dashboardKey(dashboardId) }),
  });
}

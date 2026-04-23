'use client';

/**
 * LAYER: Frontend — Client Service
 * Dashboard and widget API calls.
 */

import { get, post, patch, del } from './api-client';
import type { Dashboard, DashboardWidget } from '@/types/domain';

export const dashboardClientService = {
  async getAll(): Promise<Dashboard[]> {
    return get<Dashboard[]>('/api/dashboards');
  },

  async getById(id: string): Promise<Dashboard & { widgets: DashboardWidget[] }> {
    return get<Dashboard & { widgets: DashboardWidget[] }>(`/api/dashboards/${id}`);
  },

  async create(name: string): Promise<Dashboard> {
    return post<Dashboard>('/api/dashboards', { name });
  },

  async rename(id: string, name: string): Promise<Dashboard> {
    return patch<Dashboard>(`/api/dashboards/${id}`, { name });
  },

  async delete(id: string): Promise<void> {
    await del(`/api/dashboards/${id}`);
  },

  async createWidget(
    dashboardId: string,
    data: Partial<DashboardWidget>,
  ): Promise<DashboardWidget> {
    return post<DashboardWidget>(`/api/dashboards/${dashboardId}/widgets`, data);
  },

  async updateWidget(
    dashboardId: string,
    widgetId: string,
    data: Partial<DashboardWidget>,
  ): Promise<DashboardWidget> {
    return patch<DashboardWidget>(`/api/dashboards/${dashboardId}/widgets`, {
      widgetId,
      ...data,
    });
  },
};

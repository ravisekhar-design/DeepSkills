/**
 * LAYER: Backend / Core Service
 * Dashboard and widget business logic.
 */

import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { Dashboard, DashboardWidget } from '@/types/domain';

function widgetFromRow(w: any): DashboardWidget {
  return {
    id: w.id,
    dashboardId: w.dashboardId,
    title: w.title,
    chartType: w.chartType ?? undefined,
    chartConfig: (() => { try { return JSON.parse(w.chartConfig); } catch { return {}; } })(),
    dataSourceType: w.dataSourceType ?? undefined,
    dataSourceId: w.dataSourceId ?? undefined,
    dataSourceName: w.dataSourceName ?? undefined,
    dataQuery: w.dataQuery ?? undefined,
    prompt: w.prompt ?? undefined,
    gridW: w.gridW ?? undefined,
    createdAt: w.createdAt?.getTime?.() ?? w.createdAt,
  };
}

function dashboardFromRow(d: any, includeWidgets = false): Dashboard & { widgets?: DashboardWidget[] } {
  return {
    id: d.id,
    name: d.name,
    description: d.description ?? undefined,
    boundSourceType: d.boundSourceType ?? undefined,
    boundSourceId: d.boundSourceId ?? undefined,
    boundSourceName: d.boundSourceName ?? undefined,
    widgetCount: d._count?.widgets ?? d.widgets?.length,
    createdAt: d.createdAt?.getTime?.() ?? d.createdAt,
    updatedAt: d.updatedAt?.getTime?.() ?? d.updatedAt,
    ...(includeWidgets ? { widgets: (d.widgets ?? []).map(widgetFromRow) } : {}),
  };
}

export const dashboardService = {
  async getAll(userId: string): Promise<Dashboard[]> {
    const rows = await (prisma as any).dashboard.findMany({
      where: { userId },
      include: { _count: { select: { widgets: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((d: any) => dashboardFromRow(d));
  },

  async getById(userId: string, id: string): Promise<Dashboard & { widgets: DashboardWidget[] }> {
    const row = await (prisma as any).dashboard.findFirst({
      where: { id, userId },
      include: { widgets: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row) throw new NotFoundError('Dashboard', id);
    return dashboardFromRow(row, true) as Dashboard & { widgets: DashboardWidget[] };
  },

  async create(userId: string, name: string, description?: string): Promise<Dashboard> {
    if (!name?.trim()) throw new ValidationError('name is required');
    const row = await (prisma as any).dashboard.create({
      data: { userId, name: name.trim(), description: description?.trim() || null },
    });
    return dashboardFromRow(row);
  },

  async rename(userId: string, id: string, name: string): Promise<Dashboard> {
    if (!name?.trim()) throw new ValidationError('name is required');
    const existing = await (prisma as any).dashboard.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError('Dashboard', id);
    const updated = await (prisma as any).dashboard.update({
      where: { id },
      data: { name: name.trim() },
    });
    return dashboardFromRow(updated);
  },

  async bindSource(
    userId: string,
    id: string,
    sourceType: string | null,
    sourceId: string | null,
    sourceName: string | null,
  ): Promise<Dashboard> {
    const existing = await (prisma as any).dashboard.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError('Dashboard', id);
    const updated = await (prisma as any).dashboard.update({
      where: { id },
      data: { boundSourceType: sourceType, boundSourceId: sourceId, boundSourceName: sourceName },
    });
    return dashboardFromRow(updated);
  },

  async delete(userId: string, id: string): Promise<void> {
    const existing = await (prisma as any).dashboard.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError('Dashboard', id);
    await (prisma as any).dashboard.delete({ where: { id } });
  },

  async createWidget(
    userId: string,
    dashboardId: string,
    data: Partial<DashboardWidget>,
  ): Promise<DashboardWidget> {
    const dash = await (prisma as any).dashboard.findFirst({ where: { id: dashboardId, userId } });
    if (!dash) throw new NotFoundError('Dashboard', dashboardId);
    // Use scalar FK (dashboardId) instead of `dashboard: { connect: ... }`. The
    // nested-write form makes Prisma run the insert inside an interactive
    // transaction, which PrismaNeonHttp rejects with "Transactions are not
    // supported in HTTP mode".
    const row = await (prisma as any).dashboardWidget.create({
      data: {
        dashboardId,
        title: data.title ?? 'Untitled',
        chartType: data.chartType ?? 'bar',
        chartConfig: data.chartConfig ? JSON.stringify(data.chartConfig) : '{}',
        dataSourceType: data.dataSourceType ?? 'worksheet',
        dataSourceId: data.dataSourceId ?? '',
        dataSourceName: data.dataSourceName ?? '',
        dataQuery: data.dataQuery ?? null,
        prompt: data.prompt ?? '',
        gridW: data.gridW ?? 1,
      },
    });
    return widgetFromRow(row);
  },

  async updateWidget(
    userId: string,
    widgetId: string,
    data: Partial<DashboardWidget>,
  ): Promise<DashboardWidget> {
    const existing = await (prisma as any).dashboardWidget.findFirst({
      where: { id: widgetId },
      include: { dashboard: { select: { userId: true } } },
    });
    if (!existing || existing.dashboard.userId !== userId) {
      throw new NotFoundError('Widget', widgetId);
    }
    const row = await (prisma as any).dashboardWidget.update({
      where: { id: widgetId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.chartType !== undefined && { chartType: data.chartType }),
        ...(data.chartConfig !== undefined && { chartConfig: JSON.stringify(data.chartConfig) }),
        ...(data.dataQuery !== undefined && { dataQuery: data.dataQuery }),
        ...(data.prompt !== undefined && { prompt: data.prompt }),
        ...(data.gridW !== undefined && { gridW: data.gridW }),
        ...(data.dataSourceType !== undefined && { dataSourceType: data.dataSourceType }),
        ...(data.dataSourceId !== undefined && { dataSourceId: data.dataSourceId }),
        ...(data.dataSourceName !== undefined && { dataSourceName: data.dataSourceName }),
      },
    });
    return widgetFromRow(row);
  },
};

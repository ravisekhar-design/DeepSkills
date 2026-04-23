/**
 * LAYER: Middleware / BFF
 * Dashboard widget create, update, delete.
 */

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok, created } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { dashboardService } from '@/lib/services/dashboard.service';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type Params = { id: string };

// POST /api/dashboards/[id]/widgets — add a widget
export const POST = withAuth(async (req: NextRequest, session, ctx) => {
  const { id: dashboardId } = await (ctx.params as unknown as Promise<Params>);
  const body = await req.json();

  if (!body?.title || !body?.chartType || !body?.chartConfig || !body?.dataSourceType || !body?.dataSourceId) {
    throw new ValidationError('title, chartType, chartConfig, dataSourceType and dataSourceId are required');
  }

  const widget = await dashboardService.createWidget(session.user.id, dashboardId, body);

  // Touch dashboard updatedAt
  await (prisma as any).dashboard.update({ where: { id: dashboardId }, data: { updatedAt: new Date() } });

  return created(widget);
});

// PATCH /api/dashboards/[id]/widgets?widgetId=xxx — update a widget
export const PATCH = withAuth(async (req: NextRequest, session, ctx) => {
  const { id: dashboardId } = await (ctx.params as unknown as Promise<Params>);
  const widgetId = req.nextUrl.searchParams.get('widgetId');
  if (!widgetId) throw new ValidationError('widgetId query param is required');

  const body = await req.json();
  const widget = await dashboardService.updateWidget(session.user.id, widgetId, body);
  return ok(widget);
});

// DELETE /api/dashboards/[id]/widgets?widgetId=xxx — remove a widget
export const DELETE = withAuth(async (req: NextRequest, session, ctx) => {
  const { id: dashboardId } = await (ctx.params as unknown as Promise<Params>);
  const widgetId = req.nextUrl.searchParams.get('widgetId');
  if (!widgetId) throw new ValidationError('widgetId query param is required');

  // Ownership: verify the widget belongs to a dashboard owned by this user
  const widget = await (prisma as any).dashboardWidget.findFirst({
    where: { id: widgetId, dashboardId },
    include: { dashboard: { select: { userId: true } } },
  });
  if (!widget || widget.dashboard.userId !== session.user.id) {
    throw new ValidationError('Widget not found');
  }

  await (prisma as any).dashboardWidget.delete({ where: { id: widgetId } });
  return ok({ success: true });
});

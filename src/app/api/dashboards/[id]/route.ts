/**
 * LAYER: Middleware / BFF
 * Single dashboard — fetch with widgets, rename, delete.
 */

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok, noContent } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { dashboardService } from '@/lib/services/dashboard.service';

export const dynamic = 'force-dynamic';

type Params = { id: string };

// GET /api/dashboards/[id]
export const GET = withAuth(async (_req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  const dashboard = await dashboardService.getById(session.user.id, id);
  return ok(dashboard);
});

// PATCH /api/dashboards/[id] — rename
export const PATCH = withAuth(async (req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  const { name } = await req.json();
  if (!name?.trim()) throw new ValidationError('name is required');
  const updated = await dashboardService.rename(session.user.id, id, name);
  return ok(updated);
});

// DELETE /api/dashboards/[id]
export const DELETE = withAuth(async (_req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  await dashboardService.delete(session.user.id, id);
  return noContent();
});

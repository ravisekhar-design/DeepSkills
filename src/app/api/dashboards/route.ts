/**
 * LAYER: Middleware / BFF
 * Dashboard list & create.
 */

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok, created } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { dashboardService } from '@/lib/services/dashboard.service';

export const dynamic = 'force-dynamic';

// GET /api/dashboards — list all dashboards for the current user
export const GET = withAuth(async (_req: NextRequest, session) => {
  const dashboards = await dashboardService.getAll(session.user.id);
  return ok(dashboards);
});

// POST /api/dashboards — create a new dashboard
export const POST = withAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  if (!body?.name?.trim()) throw new ValidationError('name is required');
  const dashboard = await dashboardService.create(session.user.id, body.name, body.description);
  return created(dashboard);
});

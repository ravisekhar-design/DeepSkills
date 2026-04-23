/**
 * LAYER: Middleware / BFF
 * External database connection CRUD.
 */

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok, created } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { databaseService } from '@/lib/services/database.service';

export const dynamic = 'force-dynamic';

// GET /api/databases
export const GET = withAuth(async (_req: NextRequest, session) => {
  const conns = await databaseService.getAll(session.user.id);
  return ok(conns);
});

// POST /api/databases — create
export const POST = withAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  const conn = await databaseService.create(session.user.id, body);
  return created({ id: conn.id });
});

// PUT /api/databases — update
export const PUT = withAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  if (!body?.id) throw new ValidationError('id is required');
  await databaseService.update(session.user.id, body.id, body);
  return ok({ success: true });
});

// DELETE /api/databases?id=xxx
export const DELETE = withAuth(async (req: NextRequest, session) => {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) throw new ValidationError('id query param is required');
  await databaseService.delete(session.user.id, id);
  return ok({ success: true });
});

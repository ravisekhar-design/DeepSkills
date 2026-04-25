import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok, noContent } from '@/lib/api/response';
import { worksheetService } from '@/lib/services/worksheet.service';

export const dynamic = 'force-dynamic';

type Params = { id: string };

// GET /api/worksheets/[id]
export const GET = withAuth(async (_req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  const ws = await worksheetService.getById(session.user.id, id);
  return ok(ws);
});

// PATCH /api/worksheets/[id]
export const PATCH = withAuth(async (req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  const body = await req.json();
  const ws = await worksheetService.update(session.user.id, id, body);
  return ok(ws);
});

// DELETE /api/worksheets/[id]
export const DELETE = withAuth(async (_req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  await worksheetService.delete(session.user.id, id);
  return noContent();
});

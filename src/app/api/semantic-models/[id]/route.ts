import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok, noContent } from '@/lib/api/response';
import { semanticService } from '@/lib/services/semantic.service';

export const dynamic = 'force-dynamic';

type Params = { id: string };

// GET /api/semantic-models/[id]
export const GET = withAuth(async (_req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  const model = await semanticService.getById(session.user.id, id);
  return ok(model);
});

// PATCH /api/semantic-models/[id]
export const PATCH = withAuth(async (req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  const body = await req.json();
  const model = await semanticService.update(session.user.id, id, body);
  return ok(model);
});

// DELETE /api/semantic-models/[id]
export const DELETE = withAuth(async (_req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  await semanticService.delete(session.user.id, id);
  return noContent();
});

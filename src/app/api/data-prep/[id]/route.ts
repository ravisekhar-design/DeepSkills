import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok, noContent } from '@/lib/api/response';
import { dataPrepService } from '@/lib/services/data-prep.service';

export const dynamic = 'force-dynamic';

type Params = { id: string };

// GET /api/data-prep/[id]
export const GET = withAuth(async (_req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  const flow = await dataPrepService.getFlowById(session.user.id, id);
  return ok(flow);
});

// PATCH /api/data-prep/[id]
export const PATCH = withAuth(async (req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  const body = await req.json();
  const flow = await dataPrepService.updateFlow(session.user.id, id, {
    name: body.name,
    description: body.description,
    steps: body.steps,
  });
  return ok(flow);
});

// DELETE /api/data-prep/[id]
export const DELETE = withAuth(async (_req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  await dataPrepService.deleteFlow(session.user.id, id);
  return noContent();
});

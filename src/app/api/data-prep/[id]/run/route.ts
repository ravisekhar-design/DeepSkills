import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok } from '@/lib/api/response';
import { dataPrepService } from '@/lib/services/data-prep.service';

export const dynamic = 'force-dynamic';

type Params = { id: string };

// POST /api/data-prep/[id]/run
export const POST = withAuth(async (_req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  const dataset = await dataPrepService.runFlow(session.user.id, id);
  return ok(dataset);
});

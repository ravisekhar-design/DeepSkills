import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok } from '@/lib/api/response';
import { dataPrepService } from '@/lib/services/data-prep.service';

export const dynamic = 'force-dynamic';

type Params = { id: string };

// POST /api/data-prep/[id]/preview  — body: { upToIndex?: number }
export const POST = withAuth(async (req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  const body = await req.json().catch(() => ({}));
  const result = await dataPrepService.previewFlow(
    session.user.id,
    id,
    body.upToIndex !== undefined ? Number(body.upToIndex) : undefined,
  );
  return ok(result);
});

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok } from '@/lib/api/response';
import { semanticService } from '@/lib/services/semantic.service';

export const dynamic = 'force-dynamic';

type Params = { id: string };

// POST /api/semantic-models/[id]/query
// Body: SemanticQuery { dimensions, measures, filters, rowLimit? }
export const POST = withAuth(async (req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  const query = await req.json();
  const result = await semanticService.executeQuery(session.user.id, id, query);
  return ok(result);
});

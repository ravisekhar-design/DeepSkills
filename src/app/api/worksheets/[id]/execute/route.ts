import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok } from '@/lib/api/response';
import { worksheetService } from '@/lib/services/worksheet.service';

export const dynamic = 'force-dynamic';

type Params = { id: string };

// POST /api/worksheets/[id]/execute
export const POST = withAuth(async (_req: NextRequest, session, ctx) => {
  const { id } = await (ctx.params as unknown as Promise<Params>);
  const result = await worksheetService.execute(session.user.id, id);
  return ok(result);
});

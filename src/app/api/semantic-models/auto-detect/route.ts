import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { semanticService } from '@/lib/services/semantic.service';

export const dynamic = 'force-dynamic';

// POST /api/semantic-models/auto-detect
// Body: { sourceType, sourceId, sourceTable?, sourceSql? }
export const POST = withAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  if (!body.sourceType || !body.sourceId) throw new ValidationError('sourceType and sourceId required');
  const fields = await semanticService.autoDetectFields(
    session.user.id,
    body.sourceType,
    body.sourceId,
    body.sourceTable,
    body.sourceSql,
  );
  return ok(fields);
});

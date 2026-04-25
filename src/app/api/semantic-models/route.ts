import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { semanticService } from '@/lib/services/semantic.service';

export const dynamic = 'force-dynamic';

// GET /api/semantic-models
export const GET = withAuth(async (_req: NextRequest, session) => {
  const models = await semanticService.getAll(session.user.id);
  return ok(models);
});

// POST /api/semantic-models
export const POST = withAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  if (!body.name?.trim()) throw new ValidationError('name is required');
  if (!body.sourceType || !body.sourceId) throw new ValidationError('source is required');
  const model = await semanticService.create(session.user.id, body);
  return ok(model);
});

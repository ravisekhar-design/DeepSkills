import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { dataPrepService } from '@/lib/services/data-prep.service';

export const dynamic = 'force-dynamic';

// GET /api/data-prep
export const GET = withAuth(async (_req: NextRequest, session) => {
  const flows = await dataPrepService.getAllFlows(session.user.id);
  return ok(flows);
});

// POST /api/data-prep
export const POST = withAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  if (!body.name?.trim()) throw new ValidationError('name is required');
  const flow = await dataPrepService.createFlow(session.user.id, body.name, body.description);
  return ok(flow);
});

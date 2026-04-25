import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { worksheetService } from '@/lib/services/worksheet.service';

export const dynamic = 'force-dynamic';

// GET /api/worksheets
export const GET = withAuth(async (_req: NextRequest, session) => {
  const list = await worksheetService.getAll(session.user.id);
  return ok(list);
});

// POST /api/worksheets
export const POST = withAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  if (!body.name?.trim()) throw new ValidationError('name is required');
  const ws = await worksheetService.create(session.user.id, body);
  return ok(ws);
});

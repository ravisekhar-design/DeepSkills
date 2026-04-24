import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok } from '@/lib/api/response';
import { dataPrepService } from '@/lib/services/data-prep.service';

export const dynamic = 'force-dynamic';

// GET /api/data-prep/datasets
export const GET = withAuth(async (_req: NextRequest, session) => {
  const datasets = await dataPrepService.getAllDatasets(session.user.id);
  return ok(datasets);
});

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { executeDbQuery } from '@/lib/db-connector';

export const dynamic = 'force-dynamic';

// POST /api/dashboards/refresh-widget
// Body: { connectionId: string, sql: string }
// Re-executes a saved widget's SQL against its database connection.
export const POST = withAuth(async (req: NextRequest, session) => {
  const { connectionId, sql } = await req.json();
  if (!connectionId || !sql) throw new ValidationError('connectionId and sql required');
  const result = await executeDbQuery(connectionId, session.user.id, sql);
  return ok({ rows: result.rows });
});

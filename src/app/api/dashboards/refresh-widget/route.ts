import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { executeDbQuery } from '@/lib/db-connector';

export const dynamic = 'force-dynamic';

// POST /api/dashboards/refresh-widget
// Body: { connectionId: string, sql: string }
// Re-executes a saved widget's SQL against its database connection.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;

    const { connectionId, sql } = await request.json();
    if (!connectionId || !sql) {
      return NextResponse.json({ error: 'connectionId and sql required' }, { status: 400 });
    }

    const result = await executeDbQuery(connectionId, userId, sql);
    return NextResponse.json({ data: { rows: result.rows } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { executeDbQuery } from '@/lib/db-connector';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboards/schema?connectionId=xxx          → list tables
 * GET /api/dashboards/schema?connectionId=xxx&table=yyy → get columns + 5 sample rows
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;

    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');
    const table = searchParams.get('table');

    if (!connectionId) return NextResponse.json({ error: 'connectionId required' }, { status: 400 });

    const { prisma } = await import('@/lib/prisma');
    const conn = await (prisma as any).databaseConnection.findFirst({
      where: { id: connectionId, userId },
      select: { id: true, type: true, database: true },
    });
    if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

    const isMySQL = conn.type === 'mysql' || conn.type === 'mariadb';

    if (!table) {
      // List tables
      const listSql = isMySQL
        ? 'SELECT TABLE_NAME as table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME'
        : "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name";

      const result = await executeDbQuery(connectionId, userId, listSql);
      const tables = result.rows.map((r: any) => r.table_name || r.TABLE_NAME).filter(Boolean);
      return NextResponse.json({ data: { tables } });
    }

    // Get columns for a table
    const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
    const columnSql = isMySQL
      ? `SELECT COLUMN_NAME as column_name, DATA_TYPE as data_type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${safeTable}' ORDER BY ORDINAL_POSITION`
      : `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${safeTable}' ORDER BY ordinal_position`;

    const columnResult = await executeDbQuery(connectionId, userId, columnSql);
    const columns = columnResult.rows.map((r: any) => ({
      name: r.column_name || r.COLUMN_NAME,
      type: r.data_type || r.DATA_TYPE,
    }));

    // Get sample rows
    const sampleSql = `SELECT * FROM ${safeTable} LIMIT 5`;
    let sampleRows: any[] = [];
    try {
      const sampleResult = await executeDbQuery(connectionId, userId, sampleSql);
      sampleRows = sampleResult.rows;
    } catch { /* non-critical */ }

    return NextResponse.json({ data: { columns, sampleRows } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Server-side database query executor.
 * Supports PostgreSQL and MySQL. Never import this in client components.
 */

export interface DbQueryResult {
  columns: string[];
  rows: any[];
  rowCount: number;
  truncated: boolean;
  executionMs?: number;
}

const MAX_ROWS = 150;

const ALLOWED_READONLY = ['SELECT', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'WITH'];

function isSafeQuery(sql: string): boolean {
  const first = sql.trim().toUpperCase().split(/\s+/)[0];
  return ALLOWED_READONLY.includes(first);
}

async function runPostgresQuery(conn: any, sql: string): Promise<DbQueryResult> {
  const { Client } = await import('pg');
  const client = new Client({
    ...(conn.connectionString
      ? { connectionString: conn.connectionString }
      : {
          host: conn.host || 'localhost',
          port: conn.port || 5432,
          database: conn.database,
          user: conn.username,
          password: conn.password,
        }),
    ssl: conn.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });
  const t0 = Date.now();
  try {
    await client.connect();
    const result = await client.query(sql);
    const allRows = result.rows || [];
    return {
      columns: (result.fields || []).map((f: any) => f.name),
      rows: allRows.slice(0, MAX_ROWS),
      rowCount: allRows.length,
      truncated: allRows.length > MAX_ROWS,
      executionMs: Date.now() - t0,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function runMysqlQuery(conn: any, sql: string): Promise<DbQueryResult> {
  const mysql = await import('mysql2/promise');
  const t0 = Date.now();
  const connection = await mysql.createConnection(
    conn.connectionString
      ? { uri: conn.connectionString, ssl: conn.ssl ? {} : undefined, connectTimeout: 10000 }
      : {
          host: conn.host || 'localhost',
          port: conn.port || 3306,
          database: conn.database,
          user: conn.username,
          password: conn.password,
          ssl: conn.ssl ? {} : undefined,
          connectTimeout: 10000,
        }
  );
  try {
    const [rows, fields] = await connection.execute(sql);
    const allRows = rows as any[];
    return {
      columns: (fields as any[]).map((f) => f.name),
      rows: allRows.slice(0, MAX_ROWS),
      rowCount: allRows.length,
      truncated: allRows.length > MAX_ROWS,
      executionMs: Date.now() - t0,
    };
  } finally {
    await connection.end().catch(() => {});
  }
}

export async function executeDbQuery(
  connectionId: string,
  userId: string,
  sql: string
): Promise<DbQueryResult> {
  const { prisma } = await import('@/lib/prisma');
  const conn = await (prisma as any).databaseConnection.findFirst({
    where: { id: connectionId, userId },
  });

  if (!conn) throw new Error('Database connection not found or unauthorized.');

  if (conn.readOnly && !isSafeQuery(sql)) {
    throw new Error(
      'Read-only connection: only SELECT, SHOW, DESCRIBE, and EXPLAIN queries are allowed.'
    );
  }

  switch (conn.type) {
    case 'postgresql':
      return runPostgresQuery(conn, sql);
    case 'mysql':
    case 'mariadb':
      return runMysqlQuery(conn, sql);
    default:
      throw new Error(
        `"${conn.type}" query execution is not yet supported. Use PostgreSQL or MySQL.`
      );
  }
}

export async function testDbConnection(connectionId: string, userId: string): Promise<string> {
  const { prisma } = await import('@/lib/prisma');
  const conn = await (prisma as any).databaseConnection.findFirst({
    where: { id: connectionId, userId },
  });
  if (!conn) throw new Error('Connection not found.');

  const testSql = conn.type === 'mysql' || conn.type === 'mariadb' ? 'SELECT 1 AS ok' : 'SELECT 1 AS ok';
  const result = await executeDbQuery(connectionId, userId, testSql);
  return `Connected successfully. Server responded in ${result.executionMs}ms.`;
}

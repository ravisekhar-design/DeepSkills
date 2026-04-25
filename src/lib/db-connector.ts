/**
 * Server-side database query executor.
 * Supports PostgreSQL and MySQL. Never import this in client components.
 *
 * PostgreSQL: uses a per-connection Pool (max 3 clients) to avoid exhausting
 * Neon / RDS connection limits under concurrent load.
 * MySQL: creates a connection per query (mysql2 has its own pooling via createPool
 * but requires additional config; kept simple here).
 */

export interface DbQueryResult {
  columns: string[];
  rows: any[];
  rowCount: number;
  truncated: boolean;
  executionMs?: number;
}

/** Default row cap for ad-hoc queries (dashboard widgets, DB explorer). */
const DEFAULT_MAX_ROWS = 150;

/** Higher cap used by the semantic engine for analytics aggregations. */
export const ANALYTICS_MAX_ROWS = 50_000;

const ALLOWED_READONLY = ['SELECT', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'WITH'];

function isSafeQuery(sql: string): boolean {
  const first = sql.trim().toUpperCase().split(/\s+/)[0];
  return ALLOWED_READONLY.includes(first);
}

// ── PostgreSQL connection pool cache ─────────────────────────────────────────

const pgPools = new Map<string, any>();

async function getPgPool(conn: any): Promise<any> {
  const key = conn.id as string;
  if (!pgPools.has(key)) {
    const { Pool } = await import('pg');
    const pool = new Pool({
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
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    // If the connection is deleted / credentials rotate, evict the pool.
    pool.on('error', () => { pgPools.delete(key); });
    pgPools.set(key, pool);
  }
  return pgPools.get(key);
}

async function runPostgresQuery(
  conn: any,
  sql: string,
  maxRows: number,
): Promise<DbQueryResult> {
  const pool = await getPgPool(conn);
  const t0 = Date.now();
  const client = await pool.connect();
  try {
    const result = await client.query(sql);
    const allRows: any[] = result.rows || [];
    return {
      columns: (result.fields || []).map((f: any) => f.name),
      rows: allRows.slice(0, maxRows),
      rowCount: allRows.length,
      truncated: allRows.length > maxRows,
      executionMs: Date.now() - t0,
    };
  } finally {
    client.release();
  }
}

// ── MySQL ─────────────────────────────────────────────────────────────────────

async function runMysqlQuery(
  conn: any,
  sql: string,
  maxRows: number,
): Promise<DbQueryResult> {
  const mysql = await import('mysql2/promise');
  const t0 = Date.now();
  const connection = await mysql.createConnection(
    conn.connectionString
      ? { uri: conn.connectionString, ssl: conn.ssl ? {} : undefined, connectTimeout: 10_000 }
      : {
          host: conn.host || 'localhost',
          port: conn.port || 3306,
          database: conn.database,
          user: conn.username,
          password: conn.password,
          ssl: conn.ssl ? {} : undefined,
          connectTimeout: 10_000,
        },
  );
  try {
    const [rows, fields] = await connection.execute(sql);
    const allRows = rows as any[];
    return {
      columns: (fields as any[]).map(f => f.name),
      rows: allRows.slice(0, maxRows),
      rowCount: allRows.length,
      truncated: allRows.length > maxRows,
      executionMs: Date.now() - t0,
    };
  } finally {
    await connection.end().catch(() => {});
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Execute a SQL query against a saved database connection.
 *
 * @param maxRows  Upper bound on rows returned. Defaults to 150 for explorer
 *                 queries; pass ANALYTICS_MAX_ROWS for semantic engine calls.
 */
export async function executeDbQuery(
  connectionId: string,
  userId: string,
  sql: string,
  maxRows = DEFAULT_MAX_ROWS,
): Promise<DbQueryResult> {
  const { prisma } = await import('@/lib/prisma');
  const conn = await (prisma as any).databaseConnection.findFirst({
    where: { id: connectionId, userId },
  });

  if (!conn) throw new Error('Database connection not found or unauthorized.');

  if (conn.readOnly && !isSafeQuery(sql)) {
    throw new Error(
      'Read-only connection: only SELECT, SHOW, DESCRIBE, and EXPLAIN queries are allowed.',
    );
  }

  switch (conn.type) {
    case 'postgresql':
      return runPostgresQuery(conn, sql, maxRows);
    case 'mysql':
    case 'mariadb':
      return runMysqlQuery(conn, sql, maxRows);
    default:
      throw new Error(
        `"${conn.type}" query execution is not yet supported. Use PostgreSQL or MySQL.`,
      );
  }
}

export async function testDbConnection(connectionId: string, userId: string): Promise<string> {
  const { prisma } = await import('@/lib/prisma');
  const conn = await (prisma as any).databaseConnection.findFirst({
    where: { id: connectionId, userId },
  });
  if (!conn) throw new Error('Connection not found.');
  const result = await executeDbQuery(connectionId, userId, 'SELECT 1 AS ok');
  return `Connected successfully. Server responded in ${result.executionMs}ms.`;
}

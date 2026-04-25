import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Cap the Prisma connection pool to avoid exhausting Neon's free-tier connection limit.
// If the DATABASE_URL already carries these params they are left unchanged.
function buildDatasourceUrl(): string {
  const raw = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(raw);
    // In serverless environments each function instance only needs 1 connection.
    // Multiple instances share Neon's connection limit, so 1 per instance is critical.
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1");
    if (!u.searchParams.has("pool_timeout"))     u.searchParams.set("pool_timeout", "15");
    return u.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
    datasources: { db: { url: buildDatasourceUrl() } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

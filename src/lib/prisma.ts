import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Build datasource URL with connection pool settings tuned for serverless (Neon).
// Parameters already present in DATABASE_URL are never overridden.
function buildDatasourceUrl(): string {
  const raw = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(raw);
    // 5 connections per warm instance is a safe ceiling for Neon's free tier.
    // connection_limit=1 caused P2024 timeouts under even modest concurrency.
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "5");
    // How long (seconds) Prisma waits for a free slot before throwing P2024.
    if (!u.searchParams.has("pool_timeout"))     u.searchParams.set("pool_timeout", "30");
    // How long (seconds) to wait for the TCP handshake with Neon.
    if (!u.searchParams.has("connect_timeout"))  u.searchParams.set("connect_timeout", "30");
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

// Cache in ALL environments so warm serverless invocations reuse the same pool.
// The original code only cached in development, causing a fresh PrismaClient
// (and new connection pool) on every production cold-start module reload.
globalForPrisma.prisma = prisma;

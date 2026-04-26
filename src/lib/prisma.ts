import { neon } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

/**
 * Neon HTTP serverless adapter replaces TCP-based connection pools.
 *
 * Why this matters for Vercel + Neon:
 *   - Standard Prisma opens persistent TCP connections (one pool per lambda instance).
 *   - Under concurrent traffic Vercel spawns many lambdas; each holds N connections.
 *   - Neon free-tier caps total connections — they exhaust quickly → P2024 timeout.
 *
 * With the HTTP adapter every Prisma query becomes an independent HTTPS fetch to
 * Neon's serverless endpoint.  No persistent connections are held between requests,
 * so the P2024 "timed out fetching a connection" error cannot occur.
 */

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createClient(): PrismaClient {
  const sql = neon(process.env.DATABASE_URL!);
  const adapter = new PrismaNeon(sql as any);
  const log = process.env.NODE_ENV === "development" ? (["query"] as const) : [];
  // Spread adapter as `any` to bypass the strict `never` typing that Prisma emits
  // for the adapter property when the driverAdapters preview type declarations
  // don't perfectly align with the installed @prisma/adapter-neon version.
  return new PrismaClient({ log, ...({ adapter } as any) });
}

export const prisma = globalForPrisma.prisma || createClient();

// Reuse across warm invocations in all environments.
globalForPrisma.prisma = prisma;

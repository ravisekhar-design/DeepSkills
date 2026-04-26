import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

/**
 * PrismaNeonHttp sends every query as a stateless HTTPS fetch to Neon's
 * serverless endpoint.  No persistent TCP connection is held between requests,
 * so the P2024 "timed out fetching a new connection" error cannot occur even
 * when Vercel spins up many concurrent lambda instances.
 */

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!, {});
  const log = process.env.NODE_ENV === "development" ? (["query"] as ["query"]) : [];
  return new PrismaClient({ log, adapter });
}

export const prisma = globalForPrisma.prisma || createClient();

globalForPrisma.prisma = prisma;

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
  const client = new PrismaClient({ log, adapter });
  // PrismaNeonHttp sends each query as a stateless HTTPS fetch — there is no
  // persistent TCP connection, so Prisma's interactive transactions cannot work.
  // Override $transaction to fail fast with a clear message instead of the
  // cryptic "Transactions are not supported in HTTP mode" runtime error.
  (client as any).$transaction = () => {
    throw new Error(
      'prisma.$transaction is not supported with PrismaNeonHttp (Neon serverless HTTP mode). ' +
      'Use Promise.all() for concurrent independent writes instead.'
    );
  };
  return client;
}

export const prisma = globalForPrisma.prisma || createClient();

globalForPrisma.prisma = prisma;

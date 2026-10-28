import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * One small pool per server instance. In production DATABASE_URL should be the provider's pooled
 * (PgBouncer, transaction mode) URL: serverless functions scale out to many instances, and each
 * holds up to DATABASE_POOL_MAX connections. Advisory locks are transaction-scoped
 * (pg_advisory_xact_lock), so they work through a transaction pooler.
 */
function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX) || 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

// Reuse across hot reloads in dev and across requests on a warm serverless instance.
globalForPrisma.prisma = prisma;

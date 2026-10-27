import "server-only";
import { prisma } from "./db";

/** Fixed-window counter stored in Postgres (works across serverless instances). */
export async function hit(key: string, limit: number, windowSeconds: number) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;
  const row = rows[0]!;
  return {
    ok: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    retryAfter: Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000),
  };
}

export async function clear(key: string) {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

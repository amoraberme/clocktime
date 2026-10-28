import { env } from "@/lib/env";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * Liveness and configuration check for uptime monitors. Public: reports only pass/fail, never
 * values. 503 when the database is unreachable or the environment is misconfigured.
 */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, "ok" | "fail"> = {};
  let configError: string | undefined;
  try {
    env();
    checks.config = "ok";
  } catch (err) {
    checks.config = "fail";
    // Variable names only (never values), so the operator knows what to fix.
    configError = err instanceof Error ? err.message.split("\n").slice(1).join("; ") : undefined;
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "fail";
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  return Response.json(
    {
      status: ok ? "ok" : "degraded",
      checks,
      ...(configError ? { configError } : {}),
      region: process.env.VERCEL_REGION ?? null,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      ms: Date.now() - started,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Feature } from "@/config/plans";
import { effectivePlan, hasFeature } from "@/lib/entitlements";
import type { AppContext } from "./context";
import { parseSettings } from "@/lib/settings";
import { UserError } from "./action";
import { randomToken, sha256 } from "./crypto";
import { prisma } from "./db";
import { hit } from "./rate-limit";
import { tenantDb } from "./tenant";

/** read: lists; punch: record punches and terminal logs; write: create/update employees; reports: attendance. */
export const API_SCOPES = ["read", "punch", "write", "reports"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** Returns the full key once; only its hash is stored. Format: ct_<prefix>_<secret>. */
export async function createApiKey(companyId: string, name: string, scopes: ApiScope[], createdById: string) {
  const prefix = randomToken(4).replace(/[-_]/g, "x").slice(0, 6);
  const secret = randomToken(24);
  const key = `ct_${prefix}_${secret}`;
  const row = await prisma.apiKey.create({
    data: { companyId, name, prefix, keyHash: sha256(key), scopes, createdById },
  });
  return { key, row };
}

export type ApiContext = Awaited<ReturnType<typeof authenticate>>;

async function authenticate(req: Request, scope: ApiScope) {
  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key.startsWith("ct_"))
    throw new ApiError(401, "Missing or malformed API key. Send `Authorization: Bearer ct_…`.");
  const row = await prisma.apiKey.findUnique({ where: { keyHash: sha256(key) }, include: { company: true } });
  if (!row || row.revokedAt) throw new ApiError(401, "Invalid API key.");
  const plan = effectivePlan(row.company);
  if (!hasFeature(plan, "api")) throw new ApiError(403, "API access needs the Pro plan.");
  if (!row.scopes.includes(scope)) throw new ApiError(403, `This key lacks the "${scope}" scope.`);
  const limit = await hit(`api:${row.id}`, 120, 60);
  if (!limit.ok) throw new ApiError(429, `Rate limit exceeded. Retry in ${limit.retryAfter}s.`);
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }
  return {
    key: row,
    company: row.company,
    plan,
    settings: parseSettings(row.company.settings),
    db: tenantDb(row.companyId),
  };
}

/**
 * A service context for API writes, acting like an admin and audited as the API key. Used to
 * reuse the same validated services the app uses (e.g. employee upsert).
 */
export function apiAppContext(api: ApiContext): AppContext {
  const can = (f: Feature) => hasFeature(api.plan, f);
  return {
    user: { id: null, name: `API key “${api.key.name}”`, email: "" },
    company: api.company,
    employee: { id: `api:${api.key.id}`, firstName: "API", lastName: api.key.name, status: "ACTIVE" },
    role: "ADMIN",
    plan: api.plan,
    isManager: true,
    isAdmin: true,
    isHr: true,
    canViewPay: true,
    approves: () => true,
    managedLocationIds: null,
    managedDepartmentIds: null,
    settings: api.settings,
    db: api.db,
    memberships: [],
    can,
  } as unknown as AppContext;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wrap a v1 route: authenticates, scopes, and turns errors into JSON. */
export function apiRoute<P = Record<string, string>>(
  scope: ApiScope,
  handler: (ctx: ApiContext, req: Request, params: P) => Promise<unknown>,
) {
  return async (req: Request, opts: { params: Promise<P> }) => {
    try {
      const ctx = await authenticate(req, scope);
      const data = await handler(ctx, req, await opts.params);
      return NextResponse.json(data);
    } catch (err) {
      if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: 422 });
      if (err instanceof z.ZodError)
        return NextResponse.json({ error: "Invalid request", issues: err.issues }, { status: 400 });
      console.error(err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

export const listQuery = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  employeeId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

export function query(req: Request) {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}

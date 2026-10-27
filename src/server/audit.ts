import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { auditHash, verifyChain } from "@/lib/audit-chain";
import { prisma } from "./db";

type Actor = { companyId: string | null; userId?: string | null; label: string };

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function requestIp() {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  } catch {
    return null;
  }
}

/**
 * Append an entry to the tamper-evident audit trail: entries are numbered per company and
 * hash-chained (see `verifyAuditChain`). Never throws into the caller's flow.
 */
export async function writeAudit(actor: Actor, input: AuditInput) {
  try {
    const ip = await requestIp();
    const before = toJson(input.before);
    const after = toJson(input.after);
    await prisma.$transaction(async (tx) => {
      // One writer per company at a time, so seq numbers and links never fork.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`audit:${actor.companyId ?? "platform"}`}))`;
      const last = await tx.auditLog.findFirst({
        where: { companyId: actor.companyId, seq: { not: null } },
        orderBy: { seq: "desc" },
        select: { seq: true, hash: true },
      });
      const entry = {
        seq: (last?.seq ?? 0) + 1,
        companyId: actor.companyId,
        actorUserId: actor.userId ?? null,
        actorLabel: actor.label,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: before ?? null,
        after: after ?? null,
        reason: input.reason ?? null,
        ip,
        createdAt: new Date(),
      };
      const prevHash = last?.hash ?? null;
      await tx.auditLog.create({
        data: { ...entry, before, after, prevHash, hash: auditHash(prevHash, entry) },
      });
    });
  } catch (err) {
    console.error("audit write failed", err);
  }
}

/** Recompute the company's audit chain. Reports the first entry that was changed, removed or reordered. */
export async function verifyAuditChain(companyId: string) {
  let start: { seq: number; hash: string | null } = { seq: 0, hash: null };
  let checked = 0;
  for (;;) {
    const batch = await prisma.auditLog.findMany({
      where: { companyId, seq: { gt: start.seq } },
      orderBy: { seq: "asc" },
      take: 2000,
    });
    if (!batch.length) break;
    const r = verifyChain(
      batch.map((b) => ({ ...b, seq: b.seq! })),
      start,
    );
    checked += r.checked;
    if (!r.ok) return { ok: false as const, checked, brokenAtSeq: r.brokenAtSeq, problem: r.problem };
    start = r.last;
  }
  const legacy = await prisma.auditLog.count({ where: { companyId, seq: null } });
  return { ok: true as const, checked, legacy, lastSeq: start.seq };
}

export function actorFrom(ctx: {
  company: { id: string };
  user: { id: string; name: string; email: string };
}): Actor {
  return { companyId: ctx.company.id, userId: ctx.user.id, label: ctx.user.name || ctx.user.email };
}

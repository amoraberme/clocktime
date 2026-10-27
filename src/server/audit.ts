import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
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

/** Append an entry to the tamper-evident audit trail. Never throws into the caller's flow. */
export async function writeAudit(actor: Actor, input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        companyId: actor.companyId,
        actorUserId: actor.userId ?? null,
        actorLabel: actor.label,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: toJson(input.before),
        after: toJson(input.after),
        reason: input.reason ?? null,
        ip: await requestIp(),
      },
    });
  } catch (err) {
    console.error("audit write failed", err);
  }
}

export function actorFrom(ctx: {
  company: { id: string };
  user: { id: string; name: string; email: string };
}): Actor {
  return { companyId: ctx.company.id, userId: ctx.user.id, label: ctx.user.name || ctx.user.email };
}

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { addDays, startOfDay } from "@/lib/time";

export type AuditFilters = { actor?: string; entity?: string; action?: string; from?: string; to?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function auditFiltersFrom(p: Record<string, string | undefined>): AuditFilters {
  const pick = (k: string) => p[k]?.trim().slice(0, 100) || undefined;
  return {
    actor: pick("actor"),
    entity: pick("entity"),
    action: pick("action"),
    from: DATE.test(p.from ?? "") ? p.from : undefined,
    to: DATE.test(p.to ?? "") ? p.to : undefined,
  };
}

/** Prisma filter for the audit log page and CSV export (dates are local days, inclusive). */
export function auditWhere(f: AuditFilters, tz: string): Prisma.AuditLogWhereInput {
  return {
    ...(f.actor ? { actorLabel: { contains: f.actor, mode: "insensitive" } } : {}),
    ...(f.entity ? { entityType: f.entity } : {}),
    ...(f.action ? { action: { startsWith: f.action } } : {}),
    ...(f.from || f.to
      ? {
          createdAt: {
            ...(f.from ? { gte: startOfDay(f.from, tz) } : {}),
            ...(f.to ? { lt: startOfDay(addDays(f.to, 1), tz) } : {}),
          },
        }
      : {}),
  };
}

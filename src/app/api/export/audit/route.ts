import { csvResponse } from "@/lib/csv";
import { formatDateTime } from "@/lib/time";
import { actorFrom, writeAudit } from "@/server/audit";
import { getContextOrThrow } from "@/server/context";
import { auditFiltersFrom, auditWhere } from "@/server/queries/audit";

// Nationwide workbooks for thousands of people take a while to build.
export const maxDuration = 120;

const MAX_ROWS = 50_000;

/** The audit log as CSV, with the same filters as the page and each entry's chain hash. */
export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await getContextOrThrow("HR");
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const filters = auditFiltersFrom(Object.fromEntries(new URL(req.url).searchParams));
  const tz = ctx.company.timezone;
  const rows = await ctx.db.auditLog.findMany({
    where: auditWhere(filters, tz),
    orderBy: { createdAt: "asc" },
    take: MAX_ROWS,
  });
  await writeAudit(actorFrom(ctx), {
    action: "audit.export",
    entityType: "AuditLog",
    after: { filters, rows: rows.length },
  });
  const json = (v: unknown) => (v == null ? "" : JSON.stringify(v));
  return csvResponse(`clocktime-audit-log.csv`, [
    ["Seq", "When", "Who", "Action", "Entity", "Entity ID", "Before", "After", "Reason", "IP", "Hash"],
    ...rows.map((r) => [
      r.seq,
      formatDateTime(r.createdAt, tz),
      r.actorLabel,
      r.action,
      r.entityType,
      r.entityId,
      json(r.before),
      json(r.after),
      r.reason,
      r.ip,
      r.hash,
    ]),
  ]);
}

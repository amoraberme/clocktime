import { z } from "zod";
import { keyToUtcDate, utcDateToKey } from "@/lib/time";
import { apiRoute, query } from "@/server/api-auth";

const q = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  status: z.enum(["PENDING", "APPROVED", "DECLINED", "CANCELED"]).default("APPROVED"),
});

/** Overtime requests by work date (default: approved, the last 31 days). */
export const GET = apiRoute("read", async (api, req) => {
  const p = q.parse(query(req));
  const from = p.from ?? new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
  const to = p.to ?? new Date().toISOString().slice(0, 10);
  const rows = await api.db.overtimeRequest.findMany({
    where: { status: p.status, date: { gte: keyToUtcDate(from), lte: keyToUtcDate(to) } },
    include: { employee: { select: { employeeNo: true } } },
    orderBy: { date: "asc" },
    take: 5000,
  });
  return {
    data: rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeNo: r.employee.employeeNo,
      date: utcDateToKey(r.date),
      minutes: r.minutes,
      status: r.status,
      reason: r.reason,
      decidedAt: r.decidedAt,
    })),
  };
});

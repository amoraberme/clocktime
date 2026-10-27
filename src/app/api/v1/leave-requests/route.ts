import { z } from "zod";
import { keyToUtcDate, utcDateToKey } from "@/lib/time";
import { apiRoute, query } from "@/server/api-auth";

const q = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  status: z.enum(["PENDING", "APPROVED", "DECLINED", "CANCELED"]).default("APPROVED"),
});

/** Leave overlapping a date range (default: approved, the last and next 30 days). */
export const GET = apiRoute("read", async (api, req) => {
  const p = q.parse(query(req));
  const from = p.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const to = p.to ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const rows = await api.db.leaveRequest.findMany({
    where: { status: p.status, startDate: { lte: keyToUtcDate(to) }, endDate: { gte: keyToUtcDate(from) } },
    include: { leaveType: true, employee: { select: { employeeNo: true } } },
    orderBy: { startDate: "asc" },
    take: 2000,
  });
  return {
    data: rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeNo: r.employee.employeeNo,
      type: r.leaveType.code,
      typeName: r.leaveType.name,
      paid: r.leaveType.paid,
      startDate: utcDateToKey(r.startDate),
      endDate: utcDateToKey(r.endDate),
      days: r.days,
      status: r.status,
      decidedAt: r.decidedAt,
    })),
  };
});

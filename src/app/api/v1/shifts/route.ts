import { apiRoute, listQuery, query } from "@/server/api-auth";
import { addDays, dateKey, startOfDay } from "@/lib/time";

export const GET = apiRoute("read", async (ctx, req) => {
  const q = listQuery.parse(query(req));
  const tz = ctx.company.timezone;
  const from = q.from ?? dateKey(new Date(), tz);
  const to = q.to ?? addDays(from, 13);
  const rows = await ctx.db.shift.findMany({
    where: {
      status: "PUBLISHED",
      startAt: { gte: startOfDay(from, tz), lt: startOfDay(addDays(to, 1), tz) },
      ...(q.employeeId ? { employeeId: q.employeeId } : {}),
    },
    include: { location: { select: { id: true, name: true } }, position: { select: { name: true } } },
    orderBy: { id: "asc" },
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, q.limit);
  return {
    data: page.map((s) => ({
      id: s.id,
      employeeId: s.employeeId,
      location: s.location,
      position: s.position?.name ?? null,
      startAt: s.startAt,
      endAt: s.endAt,
      breakMinutes: s.breakMinutes,
      confirmed: !!s.confirmedAt,
    })),
    nextCursor: rows.length > q.limit ? page.at(-1)!.id : null,
  };
});

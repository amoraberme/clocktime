import { apiRoute, listQuery, query } from "@/server/api-auth";
import { addDays, dateKey, startOfDay } from "@/lib/time";

export const GET = apiRoute("read", async (ctx, req) => {
  const q = listQuery.parse(query(req));
  const tz = ctx.company.timezone;
  const to = q.to ?? dateKey(new Date(), tz);
  const from = q.from ?? addDays(to, -14);
  const rows = await ctx.db.timeEntry.findMany({
    where: {
      clockInAt: { gte: startOfDay(from, tz), lt: startOfDay(addDays(to, 1), tz) },
      ...(q.employeeId ? { employeeId: q.employeeId } : {}),
    },
    include: { breaks: true, location: { select: { id: true, name: true } } },
    orderBy: { id: "asc" },
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, q.limit);
  return {
    data: page.map((e) => ({
      id: e.id,
      employeeId: e.employeeId,
      location: e.location,
      clockInAt: e.clockInAt,
      clockOutAt: e.clockOutAt,
      breaks: e.breaks.map((b) => ({ startAt: b.startAt, endAt: b.endAt, paid: b.paid })),
      source: e.inSource,
      status: e.status,
      gps: e.inLat != null ? { lat: e.inLat, lng: e.inLng, accuracy: e.inAccuracy } : null,
      outsideGeofence: e.inOutsideGeofence || e.outOutsideGeofence,
    })),
    nextCursor: rows.length > q.limit ? page.at(-1)!.id : null,
  };
});

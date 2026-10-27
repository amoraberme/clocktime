import "server-only";
import { dailyRate } from "@/lib/pay/gross";
import { elapsedMinutes } from "@/lib/pay/hours";
import { addDays, dateKey, startOfDay } from "@/lib/time";
import type { AppContext } from "../context";

export async function dashboardData(ctx: AppContext) {
  const tz = ctx.company.timezone;
  const today = dateKey(new Date(), tz);
  const dayStart = startOfDay(today, tz);
  const dayEnd = startOfDay(addDays(today, 1), tz);
  const scope = ctx.managedLocationIds ? { locationId: { in: ctx.managedLocationIds } } : {};
  const empScope = ctx.managedLocationIds
    ? { locations: { some: { locationId: { in: ctx.managedLocationIds } } } }
    : {};
  const now = new Date();

  const [employees, entries, shifts, pendingLeave, pendingSwaps, pendingOt, openExceptions, staleOpen] =
    await Promise.all([
      ctx.db.employee.findMany({
        where: { status: { not: "ARCHIVED" }, ...empScope },
        include: { position: { select: { name: true, color: true } } },
        orderBy: [{ firstName: "asc" }],
      }),
      ctx.db.timeEntry.findMany({
        where: { ...scope, OR: [{ clockInAt: { gte: dayStart, lt: dayEnd } }, { clockOutAt: null }] },
        include: { breaks: true, location: { select: { name: true } } },
        orderBy: { clockInAt: "asc" },
      }),
      ctx.db.shift.findMany({
        where: { ...scope, status: "PUBLISHED", startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
        include: { location: { select: { name: true } } },
        orderBy: { startAt: "asc" },
      }),
      ctx.can("leave") ? ctx.db.leaveRequest.count({ where: { status: "PENDING" } }) : 0,
      ctx.can("shiftSwaps") ? ctx.db.shiftSwapRequest.count({ where: { status: "PENDING_MANAGER" } }) : 0,
      ctx.can("overtime") ? ctx.db.overtimeRequest.count({ where: { status: "PENDING" } }) : 0,
      ctx.can("exceptions") ? ctx.db.timeException.count({ where: { status: "OPEN" } }) : 0,
      ctx.db.timeEntry.count({
        where: {
          ...scope,
          clockOutAt: null,
          clockInAt: { lt: new Date(now.getTime() - ctx.settings.missedClockOutHours * 3600_000) },
        },
      }),
    ]);

  const byId = new Map(employees.map((e) => [e.id, e]));
  const visibleEntries = entries.filter((e) => byId.has(e.employeeId));
  const onClock = visibleEntries.filter((e) => !e.clockOutAt);
  const onBreak = onClock.filter((e) => e.breaks.some((b) => !b.endAt));

  let minutesToday = 0;
  let laborCost = 0;
  for (const e of visibleEntries) {
    const emp = byId.get(e.employeeId)!;
    // Only count the part of the entry that falls on today.
    const start = e.clockInAt < dayStart ? dayStart : e.clockInAt;
    const mins = elapsedMinutes(
      { ...e, clockInAt: start, clockOutAt: e.clockOutAt ?? (now < dayEnd ? now : dayEnd) },
      now,
    );
    minutesToday += mins;
    const hourly =
      dailyRate(
        { payType: emp.payType, rateCentavos: emp.rateCentavos, workDaysPerYear: emp.workDaysPerYear },
        ctx.settings.dailyRegularMinutes,
      ) /
      (ctx.settings.dailyRegularMinutes / 60);
    laborCost += (mins / 60) * hourly;
  }

  const lateOrMissing = shifts.filter((s) => {
    if (!s.employeeId || !byId.has(s.employeeId)) return false;
    if (s.startAt.getTime() + ctx.settings.lateGraceMinutes * 60000 > now.getTime()) return false;
    return !visibleEntries.some(
      (e) => e.employeeId === s.employeeId && e.clockInAt < s.endAt && (e.clockOutAt ?? now) > s.startAt,
    );
  });

  const timeline = employees
    .map((emp) => ({
      employee: emp,
      shifts: shifts.filter((s) => s.employeeId === emp.id),
      entries: visibleEntries.filter((e) => e.employeeId === emp.id),
    }))
    .filter((r) => r.shifts.length > 0 || r.entries.length > 0);

  return {
    today,
    dayStart,
    dayEnd,
    activeCount: employees.filter((e) => e.status === "ACTIVE").length,
    onClock: onClock.map((e) => ({ entry: e, employee: byId.get(e.employeeId)! })),
    onBreakCount: onBreak.length,
    minutesToday,
    laborCost: Math.round(laborCost),
    lateOrMissing: lateOrMissing.map((s) => ({ shift: s, employee: byId.get(s.employeeId!)! })),
    timeline,
    openShifts: shifts.filter((s) => !s.employeeId).length,
    inbox: { pendingLeave, pendingSwaps, pendingOt, openExceptions, staleOpen },
  };
}

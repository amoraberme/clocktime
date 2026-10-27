import "server-only";
import {
  addDays,
  atMinute,
  dateKey,
  eachDay,
  keyToUtcDate,
  startOfDay,
  utcDateToKey,
  weekday,
} from "@/lib/time";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import { requireFeature, type AppContext } from "../context";
import { prisma } from "../db";
import { shiftWarnings } from "./schedule";

async function weekContext(ctx: AppContext, weekStart: string, locationId: string | null) {
  const tz = ctx.company.timezone;
  const range = { gte: startOfDay(weekStart, tz), lt: startOfDay(addDays(weekStart, 7), tz) };
  const [shifts, employees, leave, availability] = await Promise.all([
    ctx.db.shift.findMany({ where: { startAt: range } }),
    ctx.db.employee.findMany({
      where: { status: "ACTIVE", ...(locationId ? { locations: { some: { locationId } } } : {}) },
      include: { locations: true },
    }),
    ctx.db.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: keyToUtcDate(addDays(weekStart, 6)) },
        endDate: { gte: keyToUtcDate(weekStart) },
      },
    }),
    ctx.db.availability.findMany({}),
  ]);
  return { tz, shifts, employees, leave, availability };
}

const paidMinutes = (s: { startAt: Date; endAt: Date; breakMinutes: number }) =>
  Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60000) - s.breakMinutes;

/** Assign open shifts to available people, giving each to whoever has the fewest hours so far. */
export async function autoFillOpenShifts(ctx: AppContext, weekStart: string, locationId: string | null) {
  requireFeature(ctx, "autoSchedule");
  const w = await weekContext(ctx, weekStart, locationId);
  const open = w.shifts.filter((s) => !s.employeeId && (!locationId || s.locationId === locationId));
  if (open.length === 0) throw new UserError("There are no open shifts to fill this week.");
  const assigned = w.shifts.filter((s) => s.employeeId);
  const hours = new Map<string, number>();
  for (const s of assigned) hours.set(s.employeeId!, (hours.get(s.employeeId!) ?? 0) + paidMinutes(s));
  let filled = 0;
  for (const shift of open.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())) {
    const candidates = w.employees
      .filter((e) => e.locations.length === 0 || e.locations.some((l) => l.locationId === shift.locationId))
      .filter((e) => !shift.positionId || !e.positionId || e.positionId === shift.positionId)
      .filter((e) => {
        const trial = [...assigned.filter((a) => a.employeeId === e.id), { ...shift, employeeId: e.id }];
        const warn =
          shiftWarnings(trial, {
            timezone: w.tz,
            dailyRegularMinutes: ctx.settings.dailyRegularMinutes,
            leave: w.leave
              .filter((l) => l.employeeId === e.id)
              .map((l) => ({
                employeeId: e.id,
                start: utcDateToKey(l.startDate),
                end: utcDateToKey(l.endDate),
              })),
            availability: w.availability
              .filter((a) => a.employeeId === e.id)
              .map((a) => ({ ...a, date: a.date ? utcDateToKey(a.date) : null })),
            restDays: new Map([[e.id, e.restDays]]),
          }).get(shift.id) ?? [];
        return !warn.some(
          (x) =>
            x.code === "DOUBLE_BOOKED" ||
            x.code === "ON_LEAVE" ||
            x.code === "UNAVAILABLE" ||
            x.code === "REST_DAY",
        );
      })
      // Prefer exact position matches, then whoever has the fewest hours.
      .sort((a, b) => {
        const pa = shift.positionId && a.positionId === shift.positionId ? 0 : 1;
        const pb = shift.positionId && b.positionId === shift.positionId ? 0 : 1;
        return pa - pb || (hours.get(a.id) ?? 0) - (hours.get(b.id) ?? 0);
      });
    const pick = candidates[0];
    if (!pick) continue;
    await prisma.shift.update({ where: { id: shift.id }, data: { employeeId: pick.id, confirmedAt: null } });
    assigned.push({ ...shift, employeeId: pick.id });
    hours.set(pick.id, (hours.get(pick.id) ?? 0) + paidMinutes(shift));
    filled++;
  }
  await writeAudit(actorFrom(ctx), {
    action: "schedule.autofill",
    entityType: "Schedule",
    entityId: weekStart,
    after: { filled, open: open.length },
  });
  return filled;
}

/** Draft a shift for each person on each day they've said they're available (skipping rest days and leave). */
export async function buildFromAvailability(ctx: AppContext, weekStart: string, locationId: string) {
  requireFeature(ctx, "autoSchedule");
  const w = await weekContext(ctx, weekStart, locationId);
  const maxSpan = ctx.settings.dailyRegularMinutes + ctx.settings.mealBreakMinutes;
  const data = [];
  for (const e of w.employees) {
    const rules = w.availability.filter((a) => a.employeeId === e.id && a.available);
    if (rules.length === 0) continue;
    for (const day of eachDay(weekStart, addDays(weekStart, 6))) {
      if (e.restDays.includes(weekday(day))) continue;
      if (w.shifts.some((s) => s.employeeId === e.id && dateKey(s.startAt, w.tz) === day)) continue;
      if (
        w.leave.some(
          (l) => l.employeeId === e.id && day >= utcDateToKey(l.startDate) && day <= utcDateToKey(l.endDate),
        )
      )
        continue;
      const dated = rules.filter((r) => r.date && utcDateToKey(r.date) === day);
      const window = (
        dated.length ? dated : rules.filter((r) => r.date === null && r.weekday === weekday(day))
      )[0];
      if (!window) continue;
      const span = Math.min(window.endMinute - window.startMinute, maxSpan);
      if (span < 4 * 60) continue;
      data.push({
        companyId: ctx.company.id,
        locationId,
        employeeId: e.id,
        positionId: e.positionId,
        startAt: atMinute(day, window.startMinute, w.tz),
        endAt: atMinute(day, window.startMinute + span, w.tz),
        breakMinutes: span > ctx.settings.autoDeductBreakAfterMinutes ? ctx.settings.mealBreakMinutes : 0,
        status: "DRAFT" as const,
      });
    }
  }
  if (data.length === 0)
    throw new UserError(
      "No one has availability that fits an open day this week. Ask your team to set their availability.",
    );
  await prisma.shift.createMany({ data });
  await writeAudit(actorFrom(ctx), {
    action: "schedule.autobuild",
    entityType: "Schedule",
    entityId: weekStart,
    after: { created: data.length },
  });
  return data.length;
}

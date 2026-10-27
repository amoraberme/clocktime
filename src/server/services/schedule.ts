import "server-only";
import { RRule } from "rrule";
import { z } from "zod";
import type { Shift } from "@/generated/prisma/client";
import {
  addDays,
  atMinute,
  dateKey,
  eachDay,
  keyToUtcDate,
  minuteOfDay,
  parseHHMM,
  startOfDay,
  utcDateToKey,
  weekday,
} from "@/lib/time";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import { requireFeature, type AppContext } from "../context";
import { prisma } from "../db";
import { employeeScopeWhere } from "../scope";
import { notify } from "./notifications";

export const shiftInputSchema = z.object({
  date: z.iso.date(),
  start: z.string().regex(/^\d{1,2}:\d{2}$/),
  end: z.string().regex(/^\d{1,2}:\d{2}$/),
  breakMinutes: z.coerce.number().int().min(0).max(240).default(60),
  employeeId: z.string().nullish(),
  locationId: z.string().min(1, "Choose a location"),
  positionId: z.string().nullish(),
  notes: z.string().max(300).nullish(),
  /** Weekdays (0=Sun) to repeat on, weekly */
  repeatDays: z.array(z.number().int().min(0).max(6)).default([]),
  repeatUntil: z.iso.date().nullish(),
});

export type ShiftInput = z.infer<typeof shiftInputSchema>;

function times(ctx: AppContext, date: string, start: string, end: string) {
  const s = parseHHMM(start);
  let e = parseHHMM(end);
  if (e <= s) e += 1440; // overnight shift
  if (e - s > 16 * 60) throw new UserError("A shift can't be longer than 16 hours.");
  return {
    startAt: atMinute(date, s, ctx.company.timezone),
    endAt: atMinute(date, e, ctx.company.timezone),
    startMinute: s,
    duration: e - s,
  };
}

async function assertRefs(
  ctx: AppContext,
  input: { employeeId?: string | null; locationId: string; positionId?: string | null },
) {
  const loc = await ctx.db.location.findUnique({ where: { id: input.locationId } });
  if (!loc || loc.archivedAt) throw new UserError("Location not found.");
  if (ctx.managedLocationIds && !ctx.managedLocationIds.includes(loc.id))
    throw new UserError("You don't manage that location.");
  if (input.employeeId) {
    const emp = await ctx.db.employee.findUnique({ where: { id: input.employeeId } });
    if (!emp || emp.status === "ARCHIVED") throw new UserError("Employee not found.");
  }
  if (input.positionId && !(await ctx.db.position.findUnique({ where: { id: input.positionId } }))) {
    throw new UserError("Position not found.");
  }
}

export async function createShift(ctx: AppContext, raw: unknown) {
  const input = shiftInputSchema.parse(raw);
  if (!input.employeeId) requireFeature(ctx, "openShifts");
  await assertRefs(ctx, input);
  const t = times(ctx, input.date, input.start, input.end);
  const base = {
    companyId: ctx.company.id,
    locationId: input.locationId,
    employeeId: input.employeeId || null,
    positionId: input.positionId || null,
    breakMinutes: input.breakMinutes,
    notes: input.notes || null,
    status: "DRAFT" as const,
  };
  if (input.repeatDays.length === 0) {
    const shift = await prisma.shift.create({ data: { ...base, startAt: t.startAt, endAt: t.endAt } });
    await writeAudit(actorFrom(ctx), { action: "shift.create", entityType: "Shift", entityId: shift.id });
    return [shift];
  }
  requireFeature(ctx, "recurringShifts");
  const until = input.repeatUntil ?? addDays(input.date, 7 * 12 - 1);
  if (until < input.date) throw new UserError("The repeat end date is before the first shift.");
  if (until > addDays(input.date, 7 * 26)) throw new UserError("Repeat for at most 26 weeks at a time.");
  const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const rrule = `FREQ=WEEKLY;BYDAY=${input.repeatDays.map((d) => days[d]).join(",")}`;
  const recurrence = await prisma.shiftRecurrence.create({
    data: {
      companyId: ctx.company.id,
      rrule,
      locationId: input.locationId,
      employeeId: input.employeeId || null,
      positionId: input.positionId || null,
      startMinute: t.startMinute,
      durationMinutes: t.duration,
      breakMinutes: input.breakMinutes,
      startsOn: keyToUtcDate(input.date),
      endsOn: keyToUtcDate(until),
    },
  });
  const dates = recurrenceDates(rrule, input.date, until);
  const tz = ctx.company.timezone;
  await prisma.shift.createMany({
    data: dates.map((d) => ({
      ...base,
      recurrenceId: recurrence.id,
      startAt: atMinute(d, t.startMinute, tz),
      endAt: atMinute(d, t.startMinute + t.duration, tz),
    })),
  });
  await writeAudit(actorFrom(ctx), {
    action: "shift.recurrence.create",
    entityType: "ShiftRecurrence",
    entityId: recurrence.id,
    after: { rrule, until, count: dates.length },
  });
  return prisma.shift.findMany({ where: { recurrenceId: recurrence.id } });
}

/** Local dates matching a weekly RRULE between two date keys (inclusive). */
export function recurrenceDates(rrule: string, from: string, until: string) {
  const rule = new RRule({
    ...RRule.parseString(rrule),
    dtstart: keyToUtcDate(from),
    until: new Date(keyToUtcDate(until).getTime() + 86_399_000),
  });
  return rule.all().map((d) => utcDateToKey(d));
}

export async function updateShift(
  ctx: AppContext,
  shiftId: string,
  raw: unknown,
  scope: "one" | "future" = "one",
) {
  const input = shiftInputSchema.parse(raw);
  const existing = await ctx.db.shift.findUnique({ where: { id: shiftId } });
  if (!existing) throw new UserError("Shift not found.");
  if (!input.employeeId) requireFeature(ctx, "openShifts");
  await assertRefs(ctx, input);
  const t = times(ctx, input.date, input.start, input.end);
  const data = {
    employeeId: input.employeeId || null,
    locationId: input.locationId,
    positionId: input.positionId || null,
    breakMinutes: input.breakMinutes,
    notes: input.notes || null,
    // A changed published shift needs re-confirming.
    confirmedAt:
      existing.employeeId === (input.employeeId || null) && existing.startAt.getTime() === t.startAt.getTime()
        ? existing.confirmedAt
        : null,
  };
  if (scope === "future" && existing.recurrenceId) {
    const tz = ctx.company.timezone;
    const future = await ctx.db.shift.findMany({
      where: { recurrenceId: existing.recurrenceId, startAt: { gte: existing.startAt } },
    });
    for (const s of future) {
      const d = dateKey(s.startAt, tz);
      await prisma.shift.update({
        where: { id: s.id },
        data: {
          ...data,
          startAt: atMinute(d, t.startMinute, tz),
          endAt: atMinute(d, t.startMinute + t.duration, tz),
        },
      });
    }
  } else {
    await ctx.db.shift.update({
      where: { id: shiftId },
      data: { ...data, startAt: t.startAt, endAt: t.endAt },
    });
  }
  await writeAudit(actorFrom(ctx), {
    action: "shift.update",
    entityType: "Shift",
    entityId: shiftId,
    before: { employeeId: existing.employeeId, startAt: existing.startAt, endAt: existing.endAt },
    after: { employeeId: data.employeeId, startAt: t.startAt, endAt: t.endAt, scope },
  });
  if (existing.status === "PUBLISHED") {
    const affected = new Set([existing.employeeId, data.employeeId].filter(Boolean) as string[]);
    for (const employeeId of affected) {
      await notify(ctx.company.id, employeeId, {
        kind: "shift.changed",
        title: "Your schedule changed",
        body: "A published shift was updated. Check your schedule.",
        url: "/me/schedule",
      });
    }
  }
}

export async function deleteShift(ctx: AppContext, shiftId: string, scope: "one" | "future" = "one") {
  const existing = await ctx.db.shift.findUnique({ where: { id: shiftId } });
  if (!existing) throw new UserError("Shift not found.");
  if (scope === "future" && existing.recurrenceId) {
    await ctx.db.shift.deleteMany({
      where: { recurrenceId: existing.recurrenceId, startAt: { gte: existing.startAt } },
    });
    await prisma.shiftRecurrence.update({
      where: { id: existing.recurrenceId },
      data: { endsOn: keyToUtcDate(addDays(dateKey(existing.startAt, ctx.company.timezone), -1)) },
    });
  } else {
    await ctx.db.shift.delete({ where: { id: shiftId } });
  }
  await writeAudit(actorFrom(ctx), {
    action: "shift.delete",
    entityType: "Shift",
    entityId: shiftId,
    before: { employeeId: existing.employeeId, startAt: existing.startAt, scope },
  });
  if (existing.status === "PUBLISHED" && existing.employeeId) {
    await notify(ctx.company.id, existing.employeeId, {
      kind: "shift.removed",
      title: "A shift was removed",
      body: "Check your updated schedule.",
      url: "/me/schedule",
    });
  }
}

/** Drag-and-drop: move a shift to another person and/or day, keeping its times. */
export async function moveShift(
  ctx: AppContext,
  shiftId: string,
  target: { employeeId: string | null; date: string },
) {
  const s = await ctx.db.shift.findUnique({ where: { id: shiftId } });
  if (!s) throw new UserError("Shift not found.");
  if (!target.employeeId) requireFeature(ctx, "openShifts");
  if (target.employeeId) await assertRefs(ctx, { employeeId: target.employeeId, locationId: s.locationId });
  const tz = ctx.company.timezone;
  const startMin = minuteOfDay(s.startAt, tz);
  const duration = Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60000);
  const startAt = atMinute(target.date, startMin, tz);
  await ctx.db.shift.update({
    where: { id: shiftId },
    data: {
      employeeId: target.employeeId,
      startAt,
      endAt: new Date(startAt.getTime() + duration * 60000),
      confirmedAt: null,
      recurrenceId: null,
    },
  });
  await writeAudit(actorFrom(ctx), {
    action: "shift.move",
    entityType: "Shift",
    entityId: shiftId,
    before: { employeeId: s.employeeId, startAt: s.startAt },
    after: { ...target },
  });
}

function weekRange(ctx: AppContext, weekStart: string) {
  const tz = ctx.company.timezone;
  return { gte: startOfDay(weekStart, tz), lt: startOfDay(addDays(weekStart, 7), tz) };
}

export async function publishWeek(ctx: AppContext, weekStart: string, locationId?: string | null) {
  const where = {
    status: "DRAFT" as const,
    startAt: weekRange(ctx, weekStart),
    ...(locationId
      ? { locationId }
      : ctx.managedLocationIds
        ? { locationId: { in: ctx.managedLocationIds } }
        : {}),
  };
  const drafts = await ctx.db.shift.findMany({ where, select: { id: true, employeeId: true } });
  if (drafts.length === 0)
    throw new UserError("Nothing to publish. All shifts this week are already published.");
  await ctx.db.shift.updateMany({
    where: { id: { in: drafts.map((d) => d.id) } },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  const people = new Set(drafts.map((d) => d.employeeId).filter(Boolean) as string[]);
  for (const employeeId of people) {
    await notify(ctx.company.id, employeeId, {
      kind: "schedule.published",
      title: "New schedule posted",
      body: "Your shifts for the week are ready. Tap to review and confirm.",
      url: "/me/schedule",
    });
  }
  if (drafts.some((d) => !d.employeeId)) {
    const all = await ctx.db.employee.findMany({
      where: { status: "ACTIVE", role: "EMPLOYEE" },
      select: { id: true },
    });
    for (const e of all) {
      if (!people.has(e.id))
        await notify(ctx.company.id, e.id, {
          kind: "openshift.posted",
          title: "Open shifts available",
          body: "Pick up extra hours this week.",
          url: "/me/schedule",
        });
    }
  }
  await writeAudit(actorFrom(ctx), {
    action: "schedule.publish",
    entityType: "Schedule",
    entityId: weekStart,
    after: { count: drafts.length },
  });
  return { published: drafts.length, notified: people.size };
}

export async function copyWeek(
  ctx: AppContext,
  fromWeek: string,
  toWeek: string,
  locationId?: string | null,
) {
  const source = await ctx.db.shift.findMany({
    where: { startAt: weekRange(ctx, fromWeek), ...(locationId ? { locationId } : {}) },
  });
  if (source.length === 0) throw new UserError("The previous week has no shifts to copy.");
  const offset = (keyToUtcDate(toWeek).getTime() - keyToUtcDate(fromWeek).getTime()) / 86_400_000;
  const tz = ctx.company.timezone;
  const existing = await ctx.db.shift.findMany({ where: { startAt: weekRange(ctx, toWeek) } });
  const data = source
    .map((s) => {
      const d = addDays(dateKey(s.startAt, tz), offset);
      const startMin = minuteOfDay(s.startAt, tz);
      const duration = Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60000);
      const startAt = atMinute(d, startMin, tz);
      return {
        companyId: ctx.company.id,
        locationId: s.locationId,
        employeeId: s.employeeId,
        positionId: s.positionId,
        breakMinutes: s.breakMinutes,
        notes: s.notes,
        startAt,
        endAt: new Date(startAt.getTime() + duration * 60000),
        status: "DRAFT" as const,
      };
    })
    // Skip anything that would duplicate a shift already there.
    .filter(
      (n) =>
        !existing.some((e) => e.employeeId === n.employeeId && e.startAt.getTime() === n.startAt.getTime()),
    );
  if (data.length) await prisma.shift.createMany({ data });
  await writeAudit(actorFrom(ctx), {
    action: "schedule.copy",
    entityType: "Schedule",
    entityId: toWeek,
    after: { from: fromWeek, count: data.length },
  });
  return data.length;
}

export async function confirmShift(ctx: AppContext, shiftId: string) {
  const s = await ctx.db.shift.findUnique({ where: { id: shiftId } });
  if (!s || s.employeeId !== ctx.employee.id || s.status !== "PUBLISHED")
    throw new UserError("Shift not found.");
  await ctx.db.shift.update({ where: { id: shiftId }, data: { confirmedAt: new Date() } });
}

export type ShiftWarning = {
  code: "DOUBLE_BOOKED" | "ON_LEAVE" | "UNAVAILABLE" | "OVERTIME" | "REST_DAY";
  message: string;
};

/** Problems to resolve before publishing: double bookings, leave, availability, overtime, rest days. */
export function shiftWarnings(
  shifts: Pick<Shift, "id" | "employeeId" | "startAt" | "endAt" | "breakMinutes">[],
  ctx: {
    timezone: string;
    dailyRegularMinutes: number;
    leave: { employeeId: string; start: string; end: string }[];
    availability: {
      employeeId: string;
      weekday: number | null;
      date: string | null;
      startMinute: number;
      endMinute: number;
      available: boolean;
    }[];
    restDays: Map<string, number[]>;
  },
) {
  const warnings = new Map<string, ShiftWarning[]>();
  const add = (id: string, w: ShiftWarning) => warnings.set(id, [...(warnings.get(id) ?? []), w]);
  const byEmployee = new Map<string, typeof shifts>();
  for (const s of shifts)
    if (s.employeeId) byEmployee.set(s.employeeId, [...(byEmployee.get(s.employeeId) ?? []), s]);

  for (const [employeeId, list] of byEmployee) {
    const sorted = [...list].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.startAt < sorted[i - 1]!.endAt) {
        add(sorted[i]!.id, { code: "DOUBLE_BOOKED", message: "Overlaps another shift for this person" });
        add(sorted[i - 1]!.id, { code: "DOUBLE_BOOKED", message: "Overlaps another shift for this person" });
      }
    }
    for (const s of list) {
      const day = dateKey(s.startAt, ctx.timezone);
      const paid = Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60000) - s.breakMinutes;
      if (paid > ctx.dailyRegularMinutes)
        add(s.id, {
          code: "OVERTIME",
          message: `${Math.round((paid - ctx.dailyRegularMinutes) / 6) / 10}h overtime`,
        });
      if (ctx.leave.some((l) => l.employeeId === employeeId && day >= l.start && day <= l.end)) {
        add(s.id, { code: "ON_LEAVE", message: "On approved time off" });
      }
      if ((ctx.restDays.get(employeeId) ?? []).includes(weekday(day)))
        add(s.id, { code: "REST_DAY", message: "Rest day (premium pay applies)" });
      const startM = minuteOfDay(s.startAt, ctx.timezone);
      const endM = startM + Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60000);
      const rules = ctx.availability.filter(
        (a) =>
          a.employeeId === employeeId && (a.date === day || (a.date === null && a.weekday === weekday(day))),
      );
      const dated = rules.filter((r) => r.date === day);
      const effective = dated.length ? dated : rules;
      if (effective.length) {
        const blocked = effective.some((r) => !r.available && r.startMinute < endM && r.endMinute > startM);
        const windows = effective.filter((r) => r.available);
        const covered =
          windows.length === 0 || windows.some((r) => r.startMinute <= startM && r.endMinute >= endM);
        if (blocked || !covered) add(s.id, { code: "UNAVAILABLE", message: "Outside their availability" });
      }
    }
  }
  return warnings;
}

export async function weekData(ctx: AppContext, weekStart: string, locationId?: string | null) {
  const tz = ctx.company.timezone;
  const weekEnd = addDays(weekStart, 6);
  const locFilter = locationId
    ? { locationId }
    : ctx.managedLocationIds
      ? { locationId: { in: ctx.managedLocationIds } }
      : {};
  const [shifts, employees, leave, availability] = await Promise.all([
    ctx.db.shift.findMany({
      where: { startAt: weekRange(ctx, weekStart), ...locFilter },
      include: {
        position: true,
        location: { select: { name: true } },
        swapRequests: { where: { status: { in: ["PENDING_PEER", "PENDING_MANAGER"] } } },
        claims: { where: { status: "PENDING" } },
      },
      orderBy: { startAt: "asc" },
    }),
    ctx.db.employee.findMany({
      where: {
        status: { not: "ARCHIVED" },
        ...employeeScopeWhere(ctx),
        ...(locationId ? { locations: { some: { locationId } } } : {}),
      },
      include: { position: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    ctx.db.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: keyToUtcDate(weekEnd) },
        endDate: { gte: keyToUtcDate(weekStart) },
      },
      include: { leaveType: { select: { name: true } } },
    }),
    ctx.can("availability") ? ctx.db.availability.findMany({}) : Promise.resolve([]),
  ]);
  const warnings = shiftWarnings(shifts, {
    timezone: tz,
    dailyRegularMinutes: ctx.settings.dailyRegularMinutes,
    leave: leave.map((l) => ({
      employeeId: l.employeeId,
      start: utcDateToKey(l.startDate),
      end: utcDateToKey(l.endDate),
    })),
    availability: availability.map((a) => ({ ...a, date: a.date ? utcDateToKey(a.date) : null })),
    restDays: new Map(employees.map((e) => [e.id, e.restDays])),
  });
  return { days: eachDay(weekStart, weekEnd), shifts, employees, leave, availability, warnings };
}

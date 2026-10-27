import "server-only";
import type { ExceptionType, Prisma } from "@/generated/prisma/client";
import { effectivePlan, hasFeature } from "@/lib/entitlements";
import { computeHours } from "@/lib/pay/hours";
import { parseSettings } from "@/lib/settings";
import { addDays, dateKey, formatTime, keyToUtcDate, minutesBetween, startOfDay } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import type { AppContext } from "../context";
import { prisma } from "../db";
import { notifyManagers } from "./notifications";
import { approveOvertimeFor } from "./overtime";

export const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  MISSED_CLOCK_OUT: "Missed clock-out",
  LATE_ARRIVAL: "Late arrival",
  EARLY_DEPARTURE: "Left early",
  LONG_BREAK: "Long break",
  NO_SHOW: "No-show",
  OUTSIDE_GEOFENCE: "Punched outside geofence",
  UNAPPROVED_OVERTIME: "Unapproved overtime",
  MISSED_MEAL_BREAK: "No meal break",
  NO_REST_DAY: "7 days without a rest day",
  UNTRUSTED_DEVICE: "Punch from an unrecognized device",
};

type Raise = {
  companyId: string;
  employeeId: string;
  type: ExceptionType;
  date: string;
  dedupeKey: string;
  timeEntryId?: string | null;
  shiftId?: string | null;
  details?: Prisma.InputJsonValue;
};

/** Create an exception unless one with the same dedupe key already exists. Returns true if new. */
async function raise(x: Raise) {
  try {
    await prisma.timeException.create({
      data: {
        companyId: x.companyId,
        employeeId: x.employeeId,
        type: x.type,
        date: keyToUtcDate(x.date),
        dedupeKey: x.dedupeKey,
        timeEntryId: x.timeEntryId ?? null,
        shiftId: x.shiftId ?? null,
        details: x.details ?? {},
      },
    });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return false;
    throw err;
  }
}

async function companyFor(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  return { company, settings: parseSettings(company.settings), plan: effectivePlan(company) };
}

/** Detectors that run right after an accepted punch. */
export async function detectOnPunch(companyId: string, employeeId: string, entryId: string) {
  const { company, settings, plan } = await companyFor(companyId);
  if (!hasFeature(plan, "exceptions")) return;
  const tz = company.timezone;
  const entry = await prisma.timeEntry.findUnique({
    where: { id: entryId },
    include: { breaks: true, shift: true, employee: true },
  });
  if (!entry || entry.employeeId !== employeeId) return;
  const day = dateKey(entry.clockInAt, tz);
  const created: string[] = [];
  const add = async (r: Omit<Raise, "companyId" | "employeeId">) => {
    if (await raise({ companyId, employeeId, ...r })) created.push(EXCEPTION_LABELS[r.type]);
  };

  if (entry.shift) {
    const late = minutesBetween(entry.shift.startAt, entry.clockInAt);
    if (late > settings.lateGraceMinutes) {
      await add({
        type: "LATE_ARRIVAL",
        date: day,
        dedupeKey: `LATE:${entry.id}`,
        timeEntryId: entry.id,
        shiftId: entry.shiftId,
        details: { minutes: late, scheduled: formatTime(entry.shift.startAt, tz) },
      });
    }
    if (entry.clockOutAt) {
      const early = minutesBetween(entry.clockOutAt, entry.shift.endAt);
      if (early > settings.lateGraceMinutes) {
        await add({
          type: "EARLY_DEPARTURE",
          date: day,
          dedupeKey: `EARLY:${entry.id}`,
          timeEntryId: entry.id,
          shiftId: entry.shiftId,
          details: { minutes: early, scheduled: formatTime(entry.shift.endAt, tz) },
        });
      }
    }
  }
  if (entry.inOutsideGeofence || entry.outOutsideGeofence) {
    await add({
      type: "OUTSIDE_GEOFENCE",
      date: day,
      dedupeKey: `GEO:${entry.id}:${entry.outOutsideGeofence ? "out" : "in"}`,
      timeEntryId: entry.id,
      details: { clockIn: entry.inOutsideGeofence, clockOut: entry.outOutsideGeofence },
    });
  }
  if (entry.clockOutAt) {
    for (const b of entry.breaks) {
      if (!b.endAt || b.paid) continue;
      const mins = minutesBetween(b.startAt, b.endAt);
      if (mins > settings.mealBreakMinutes + settings.longBreakToleranceMinutes) {
        await add({
          type: "LONG_BREAK",
          date: day,
          dedupeKey: `BREAK:${b.id}`,
          timeEntryId: entry.id,
          details: { minutes: mins },
        });
      }
    }
    const span = minutesBetween(entry.clockInAt, entry.clockOutAt);
    if (
      !settings.autoDeductBreak &&
      span > settings.autoDeductBreakAfterMinutes &&
      !entry.breaks.some((b) => !b.paid)
    ) {
      await add({
        type: "MISSED_MEAL_BREAK",
        date: day,
        dedupeKey: `MEAL:${entry.id}`,
        timeEntryId: entry.id,
        details: { minutes: span },
      });
    }
    // Overtime beyond what was approved for the day.
    if (settings.overtimeRequiresApproval && hasFeature(plan, "overtime")) {
      const dayEntries = await prisma.timeEntry.findMany({
        where: {
          companyId,
          employeeId,
          clockInAt: { gte: startOfDay(day, tz), lt: startOfDay(addDays(day, 1), tz) },
          clockOutAt: { not: null },
        },
        include: { breaks: true, shift: { select: { startAt: true, endAt: true } } },
      });
      const hours = computeHours(dayEntries, {
        timezone: tz,
        settings,
        holidays: new Map(),
        restDays: entry.employee.restDays,
      });
      const ot = hours.totals.overtimeMinutes;
      if (ot >= 15) {
        const approved = await prisma.overtimeRequest.aggregate({
          where: { companyId, employeeId, date: keyToUtcDate(day), status: "APPROVED" },
          _sum: { minutes: true },
        });
        if (ot > (approved._sum.minutes ?? 0)) {
          await add({
            type: "UNAPPROVED_OVERTIME",
            date: day,
            dedupeKey: `OT:${employeeId}:${day}`,
            details: { minutes: ot, approved: approved._sum.minutes ?? 0 },
          });
        }
      }
    }
  }
  // Seven consecutive working days (Labor Code art. 91: a 24-hour rest after six days).
  const weekAgo = startOfDay(addDays(day, -6), tz);
  const recent = await prisma.timeEntry.findMany({
    where: { companyId, employeeId, clockInAt: { gte: weekAgo } },
    select: { clockInAt: true },
  });
  const days = new Set(recent.map((r) => dateKey(r.clockInAt, tz)));
  if (Array.from({ length: 7 }, (_, i) => addDays(day, -i)).every((d) => days.has(d))) {
    await add({ type: "NO_REST_DAY", date: day, dedupeKey: `REST:${employeeId}:${day}` });
  }

  if (created.length) {
    await notifyManagers(companyId, employeeId, {
      kind: "exception",
      title: `${fullName(entry.employee)}: ${created.join(", ")}`,
      url: "/app/exceptions",
    });
  }
}

/** Scheduled detectors: missed clock-outs and no-shows. Safe to run repeatedly. */
export async function detectScheduled(now = new Date()) {
  const companies = await prisma.company.findMany({
    where: { planStatus: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
  });
  let raised = 0;
  for (const company of companies) {
    const plan = effectivePlan(company, now);
    if (!hasFeature(plan, "exceptions")) continue;
    const settings = parseSettings(company.settings);
    const tz = company.timezone;
    const stale = await prisma.timeEntry.findMany({
      where: {
        companyId: company.id,
        clockOutAt: null,
        clockInAt: { lt: new Date(now.getTime() - settings.missedClockOutHours * 3600_000) },
      },
    });
    for (const e of stale) {
      if (
        await raise({
          companyId: company.id,
          employeeId: e.employeeId,
          type: "MISSED_CLOCK_OUT",
          date: dateKey(e.clockInAt, tz),
          dedupeKey: `MISSOUT:${e.id}`,
          timeEntryId: e.id,
          details: { since: e.clockInAt.toISOString() },
        })
      )
        raised++;
    }
    const ended = await prisma.shift.findMany({
      where: {
        companyId: company.id,
        status: "PUBLISHED",
        employeeId: { not: null },
        endAt: { lt: now, gt: new Date(now.getTime() - 48 * 3600_000) },
      },
    });
    for (const s of ended) {
      const worked = await prisma.timeEntry.count({
        where: {
          employeeId: s.employeeId!,
          clockInAt: { lt: s.endAt },
          OR: [{ clockOutAt: null }, { clockOutAt: { gt: s.startAt } }],
        },
      });
      if (worked) continue;
      const onLeave = await prisma.leaveRequest.count({
        where: {
          employeeId: s.employeeId!,
          status: "APPROVED",
          startDate: { lte: keyToUtcDate(dateKey(s.startAt, tz)) },
          endDate: { gte: keyToUtcDate(dateKey(s.startAt, tz)) },
        },
      });
      if (onLeave) continue;
      if (
        await raise({
          companyId: company.id,
          employeeId: s.employeeId!,
          type: "NO_SHOW",
          date: dateKey(s.startAt, tz),
          dedupeKey: `NOSHOW:${s.id}`,
          shiftId: s.id,
          details: { scheduled: `${formatTime(s.startAt, tz)}–${formatTime(s.endAt, tz)}` },
        })
      )
        raised++;
    }
  }
  return raised;
}

export async function resolveException(
  ctx: AppContext,
  id: string,
  action: "resolve" | "dismiss" | "approve_overtime",
  note?: string,
) {
  const x = await ctx.db.timeException.findUnique({ where: { id } });
  if (!x) throw new UserError("Exception not found.");
  if (x.status !== "OPEN") throw new UserError("Already handled.");
  if (action === "approve_overtime") {
    if (x.type !== "UNAPPROVED_OVERTIME") throw new UserError("Only overtime exceptions can be approved.");
    const d = x.details as { minutes?: number; approved?: number };
    const extra = (d.minutes ?? 0) - (d.approved ?? 0);
    if (extra > 0)
      await approveOvertimeFor(
        ctx,
        x.employeeId,
        x.date.toISOString().slice(0, 10),
        extra,
        note || "Approved from exception inbox",
      );
  }
  await ctx.db.timeException.update({
    where: { id },
    data: {
      status: action === "dismiss" ? "DISMISSED" : "RESOLVED",
      resolvedById: ctx.employee.id,
      resolvedAt: new Date(),
      resolutionNote: note,
    },
  });
  await writeAudit(actorFrom(ctx), {
    action: `exception.${action}`,
    entityType: "TimeException",
    entityId: id,
    reason: note,
  });
}

/** Clear exceptions that no longer apply after a manager fixes a time entry. */
export async function recheckEntry(companyId: string, entryId: string) {
  const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
  if (entry?.clockOutAt) {
    await prisma.timeException.updateMany({
      where: { companyId, timeEntryId: entryId, type: "MISSED_CLOCK_OUT", status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolutionNote: "Clock-out added" },
    });
  }
}

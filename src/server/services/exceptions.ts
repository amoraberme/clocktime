import "server-only";
import type { ExceptionType, Prisma } from "@/generated/prisma/client";
import { INTEGRITY_LABELS, PROXY_FLAGS, TIME_FLAGS } from "@/lib/attendance/integrity";
import { effectivePlan, hasFeature } from "@/lib/entitlements";
import { computeHours } from "@/lib/pay/hours";
import { parseSettings } from "@/lib/settings";
import { addDays, dateKey, formatTime, keyToUtcDate, minutesBetween, startOfDay } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import type { AppContext } from "../context";
import { prisma } from "../db";
import { assertApprover, assertEmployeeInScope } from "../scope";
import { notifyManagers } from "./notifications";
import { approveOvertimeFor } from "./overtime";
import type { RebuildResult } from "./attendance/rebuild";

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
  LONG_DUTY: "Long duty for review",
  MISSING_CLOCK_IN: "Missing clock-in",
  LOCKED_PERIOD_PUNCH: "Punch in a closed pay period",
  OFFLINE_TIME_SUSPECT: "Offline punch time doesn't add up",
  PROXY_SUSPECT: "Possible buddy punching",
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
    const code = (err as { code?: string }).code;
    // P2002: already raised. P2003: a concurrent rebuild (e.g. the matching clock-out tap arriving
    // at the same moment) re-paired and removed the entry, so the issue no longer applies.
    if (code === "P2002" || code === "P2003") return false;
    throw err;
  }
}

async function companyFor(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  return { company, settings: parseSettings(company.settings), plan: effectivePlan(company) };
}

export async function raiseUntrustedDevice(
  companyId: string,
  employeeId: string,
  entryId: string | null,
  date: string,
) {
  if (!entryId) return;
  await raise({
    companyId,
    employeeId,
    type: "UNTRUSTED_DEVICE",
    date,
    dedupeKey: `DEVICE:${entryId}`,
    timeEntryId: entryId,
  });
}

/**
 * Raise the issues a pairing rebuild found: open duties with no clock-out, duties long enough
 * for HR review, clock-outs with no clock-in, and punches dated in a finalized pay period.
 * These are attendance integrity checks, so they apply on every plan.
 */
export async function raiseRebuildIssues(
  companyId: string,
  employeeId: string,
  tz: string,
  r: Pick<RebuildResult, "missingOut" | "longDuty" | "orphans" | "lockedPunches"> &
    Partial<Pick<RebuildResult, "entryIds">>,
) {
  // A clock-out that arrived later (an offline phone syncing the next day) closes the duty:
  // its "missed clock-out" no longer applies.
  if (r.entryIds?.length)
    await prisma.timeException.updateMany({
      where: {
        companyId,
        type: "MISSED_CLOCK_OUT",
        status: "OPEN",
        timeEntry: { id: { in: r.entryIds }, clockOutAt: { not: null } },
      },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolutionNote: "Clock-out received" },
    });
  for (const m of r.missingOut)
    await raise({
      companyId,
      employeeId,
      type: "MISSED_CLOCK_OUT",
      date: dateKey(m.at, tz),
      dedupeKey: `MISSOUT:${m.entryId}`,
      timeEntryId: m.entryId,
      details: { clockIn: m.at.toISOString() },
    });
  for (const l of r.longDuty)
    await raise({
      companyId,
      employeeId,
      type: "LONG_DUTY",
      date: dateKey(l.at, tz),
      dedupeKey: `LONGDUTY:${l.entryId}`,
      timeEntryId: l.entryId,
      details: { minutes: l.minutes },
    });
  for (const o of r.orphans.filter((x) => x.reason === "NO_CLOCK_IN"))
    await raise({
      companyId,
      employeeId,
      type: "MISSING_CLOCK_IN",
      date: dateKey(o.at, tz),
      dedupeKey: `NOIN:${o.punchId}`,
      details: { punchId: o.punchId, at: o.at.toISOString() },
    });
  for (const p of r.lockedPunches)
    await raise({
      companyId,
      employeeId,
      type: "LOCKED_PERIOD_PUNCH",
      date: dateKey(p.at, tz),
      dedupeKey: `LOCKED:${p.punchId}`,
      details: { punchId: p.punchId, at: p.at.toISOString() },
    });
}

/** Integrity flags on a punch become an exception for review (buddy punching, clock tampering). */
export async function raiseIntegrityFlags(
  companyId: string,
  employeeId: string,
  tz: string,
  p: { punchId: string; at: Date; entryId: string | null; flags: string[] },
) {
  const proxy = p.flags.filter((f) => (PROXY_FLAGS as string[]).includes(f));
  const time = p.flags.filter((f) => (TIME_FLAGS as string[]).includes(f));
  const labels = (fs: string[]) => fs.map((f) => INTEGRITY_LABELS[f as keyof typeof INTEGRITY_LABELS]);
  if (proxy.length)
    await raise({
      companyId,
      employeeId,
      type: "PROXY_SUSPECT",
      date: dateKey(p.at, tz),
      dedupeKey: `PROXY:${p.punchId}`,
      timeEntryId: p.entryId,
      details: { punchId: p.punchId, flags: proxy, reasons: labels(proxy) },
    });
  if (time.length)
    await raise({
      companyId,
      employeeId,
      type: "OFFLINE_TIME_SUSPECT",
      date: dateKey(p.at, tz),
      dedupeKey: `CLOCK:${p.punchId}`,
      timeEntryId: p.entryId,
      details: { punchId: p.punchId, flags: time, reasons: labels(time) },
    });
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
    // Split shifts (out for lunch, back in): only the first entry can be late, only the last early.
    const siblings = await prisma.timeEntry.findMany({
      where: { companyId, shiftId: entry.shiftId, id: { not: entry.id } },
      select: { id: true, clockInAt: true },
    });
    const earlier = siblings.filter((e) => e.clockInAt < entry.clockInAt).map((e) => e.id);
    const isLast = !siblings.some((e) => e.clockInAt > entry.clockInAt);
    if (earlier.length > 0) {
      await prisma.timeException.updateMany({
        where: { companyId, type: "EARLY_DEPARTURE", status: "OPEN", timeEntryId: { in: earlier } },
        data: { status: "DISMISSED", resolvedAt: new Date(), resolutionNote: "Returned to the same shift" },
      });
    }
    const late = minutesBetween(entry.shift.startAt, entry.clockInAt);
    if (earlier.length === 0 && late > settings.lateGraceMinutes) {
      await add({
        type: "LATE_ARRIVAL",
        date: day,
        dedupeKey: `LATE:${entry.id}`,
        timeEntryId: entry.id,
        shiftId: entry.shiftId,
        details: { minutes: late, scheduled: formatTime(entry.shift.startAt, tz) },
      });
    }
    if (entry.clockOutAt && isLast) {
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
  assertApprover(ctx, "attendance");
  await assertEmployeeInScope(ctx, x.employeeId);
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

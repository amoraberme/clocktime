import "server-only";
import { effectivePlan, hasFeature } from "@/lib/entitlements";
import { parseSettings } from "@/lib/settings";
import { addDays, atMinute, dateKey, formatTime, keyToUtcDate, utcDateToKey } from "@/lib/time";
import { prisma } from "../db";
import { storage } from "../storage";
import { detectOnPunch } from "./exceptions";
import { notify } from "./notifications";
import { punch } from "./timeclock";
import { recurrenceDates } from "./schedule";

/**
 * Server-side safety net for auto clock-out: entries at locations with auto clock-out that are
 * still open 2 hours after their shift ended are closed at the shift end and flagged.
 */
export async function autoClockOut(now = new Date()) {
  const open = await prisma.timeEntry.findMany({
    where: {
      clockOutAt: null,
      location: { autoClockOut: true },
      shift: { endAt: { lt: new Date(now.getTime() - 2 * 3600_000) } },
    },
    include: { shift: true, company: true, employee: true },
  });
  let closed = 0;
  for (const e of open) {
    const plan = effectivePlan(e.company, now);
    if (!hasFeature(plan, "geofence") || !e.shift) continue;
    const settings = parseSettings(e.company.settings);
    if (e.inPunchId) {
      // Recorded as a punch so the duty is re-paired like any other; flagged AUTO_OUT for review.
      await punch(
        { companyId: e.companyId, timezone: e.company.timezone, plan, settings, employee: e.employee },
        {
          action: "CLOCK_OUT",
          source: "AUTO",
          at: e.shift.endAt,
          offline: true,
          system: true,
          clientId: `auto-out:${e.id}`,
        },
      );
    } else {
      await prisma.$transaction([
        prisma.break.updateMany({
          where: { timeEntryId: e.id, endAt: null },
          data: { endAt: e.shift.endAt },
        }),
        prisma.timeEntry.update({
          where: { id: e.id },
          data: {
            clockOutAt: e.shift.endAt,
            outSource: "AUTO",
            status: "CLOSED",
            notes: "Auto clocked out at shift end",
            flags: settings.autoClockOutNeedsReview ? { push: "AUTO_OUT" } : undefined,
          },
        }),
      ]);
    }
    await prisma.auditLog.create({
      data: {
        companyId: e.companyId,
        actorLabel: "ClockTime (auto clock-out)",
        action: "timeEntry.autoClockOut",
        entityType: "TimeEntry",
        entityId: e.id,
      },
    });
    await detectOnPunch(e.companyId, e.employeeId, e.id);
    await notify(e.companyId, e.employeeId, {
      kind: "autoclockout",
      title: "You were clocked out automatically",
      body: `At your shift end, ${formatTime(e.shift.endAt, e.company.timezone)}. Tell your manager if that's wrong.`,
      url: "/me/timesheet",
    });
    closed++;
  }
  return closed;
}

/** Keep recurring shifts materialized 8 weeks ahead. */
export async function extendRecurrences(now = new Date()) {
  const recs = await prisma.shiftRecurrence.findMany({ include: { company: true } });
  let created = 0;
  for (const r of recs) {
    const tz = r.company.timezone;
    const today = dateKey(now, tz);
    const horizon = addDays(today, 56);
    const end = r.endsOn ? utcDateToKey(r.endsOn) : horizon;
    const until = end < horizon ? end : horizon;
    const last = await prisma.shift.findFirst({
      where: { recurrenceId: r.id },
      orderBy: { startAt: "desc" },
    });
    const from = last ? addDays(dateKey(last.startAt, tz), 1) : utcDateToKey(r.startsOn);
    if (from > until) continue;
    const dates = recurrenceDates(r.rrule, from < today ? today : from, until);
    if (!dates.length) continue;
    await prisma.shift.createMany({
      data: dates.map((d) => ({
        companyId: r.companyId,
        locationId: r.locationId,
        employeeId: r.employeeId,
        positionId: r.positionId,
        recurrenceId: r.id,
        breakMinutes: r.breakMinutes,
        startAt: atMinute(d, r.startMinute, tz),
        endAt: atMinute(d, r.startMinute + r.durationMinutes, tz),
        status: "DRAFT" as const,
      })),
    });
    created += dates.length;
  }
  return created;
}

/** Remind people about published shifts starting in the next 60–75 minutes (run every 15 min). */
export async function shiftReminders(now = new Date()) {
  const shifts = await prisma.shift.findMany({
    where: {
      status: "PUBLISHED",
      employeeId: { not: null },
      startAt: { gt: new Date(now.getTime() + 60 * 60000), lte: new Date(now.getTime() + 75 * 60000) },
    },
    include: { location: true, company: true },
  });
  for (const s of shifts) {
    await notify(s.companyId, s.employeeId!, {
      kind: "shift.reminder",
      title: `Shift at ${formatTime(s.startAt, s.company.timezone)}`,
      body: `${s.location.name}. Don't forget to clock in!`,
      url: "/me",
    });
  }
  return shifts.length;
}

/** Delete punch photos past each company's retention period, and old notifications. */
export async function cleanup(now = new Date()) {
  const companies = await prisma.company.findMany({ select: { id: true, settings: true } });
  let photos = 0;
  for (const c of companies) {
    const days = parseSettings(c.settings).photoRetentionDays;
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const entries = await prisma.timeEntry.findMany({
      where: {
        companyId: c.id,
        clockInAt: { lt: cutoff },
        OR: [{ inPhotoKey: { not: null } }, { outPhotoKey: { not: null } }],
      },
      select: { id: true, inPhotoKey: true, outPhotoKey: true },
    });
    for (const e of entries) {
      for (const key of [e.inPhotoKey, e.outPhotoKey])
        if (key)
          await storage()
            .delete(key)
            .catch(() => {});
      await prisma.timeEntry.update({ where: { id: e.id }, data: { inPhotoKey: null, outPhotoKey: null } });
      photos++;
    }
  }
  const notifications = await prisma.notification.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 90 * 86_400_000) } },
  });
  await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });
  return { photos, notifications: notifications.count, cutoffDate: keyToUtcDate(dateKey(now, "UTC")) };
}

import "server-only";
import type { Prisma, Punch } from "@/generated/prisma/client";
import { pairPunches, type Orphan, type PairAction } from "@/lib/attendance/pairing";
import type { CompanySettings } from "@/lib/settings";
import { dateKey, keyToUtcDate, utcDateToKey } from "@/lib/time";

type Tx = Prisma.TransactionClient;

export type RebuildInput = {
  companyId: string;
  timezone: string;
  settings: CompanySettings;
  employeeId: string;
  /** The span that changed (e.g. one punch's time); widened by the max duty on both sides. */
  from: Date;
  to: Date;
  now?: Date;
};

export type RebuildResult = {
  /** Entry each punch ended up in (absent for orphans, duplicates and locked-period punches). */
  entryByPunch: Map<string, string>;
  resolved: Map<string, Exclude<PairAction, "TOGGLE">>;
  /** Entries created or updated by this rebuild. */
  entryIds: string[];
  missingOut: { entryId: string; at: Date }[];
  longDuty: { entryId: string; at: Date; minutes: number }[];
  orphans: Orphan[];
  /** Punches dated inside a finalized pay period; they wait for HR instead of changing payroll. */
  lockedPunches: { punchId: string; at: Date }[];
};

const HOUR = 3600_000;

/**
 * Re-derive one person's time entries from their punch log around a change. Entries are updated in
 * place (matched by their clock-in punch) so breaks, notes and exceptions stay attached. Approved,
 * locked, hand-edited and legacy entries (no punch link) are left untouched, and so are the punches
 * inside them. Run inside the punch transaction, after taking the employee's advisory lock.
 */
export async function rebuildAttendance(tx: Tx, input: RebuildInput): Promise<RebuildResult> {
  const { companyId, employeeId, settings } = input;
  const maxDuty = settings.maxDutyHours * HOUR;
  let from = new Date(input.from.getTime() - maxDuty);
  let to = new Date(input.to.getTime() + maxDuty);

  const overlapping = await tx.timeEntry.findMany({
    where: {
      companyId,
      employeeId,
      clockInAt: { lt: to },
      OR: [{ clockOutAt: null }, { clockOutAt: { gt: from } }],
    },
    select: {
      id: true,
      clockInAt: true,
      clockOutAt: true,
      status: true,
      manualOverride: true,
      inPunchId: true,
      outPunchId: true,
    },
  });
  for (const e of overlapping) {
    if (e.clockInAt < from) from = e.clockInAt;
    if (e.clockOutAt && e.clockOutAt > to) to = e.clockOutAt;
  }
  for (const e of overlapping) {
    if (!e.inPunchId && e.status !== "APPROVED" && e.status !== "LOCKED" && !e.manualOverride) {
      const ids = await adoptLegacyEntry(tx, companyId, employeeId, e.id);
      e.inPunchId = ids.inPunchId;
      e.outPunchId = ids.outPunchId;
    }
  }
  const isFixed = (e: (typeof overlapping)[number]) =>
    e.status === "APPROVED" || e.status === "LOCKED" || e.manualOverride || !e.inPunchId;
  const fixed = overlapping.filter(isFixed);
  const derived = overlapping.filter((e) => !isFixed(e));
  const fixedIds = new Set(fixed.map((e) => e.id));

  const [allPunches, shifts, lockedRuns] = await Promise.all([
    tx.punch.findMany({
      where: {
        companyId,
        employeeId,
        accepted: true,
        voidedAt: null,
        duplicateOfId: null,
        at: { gte: from, lte: to },
      },
      orderBy: { at: "asc" },
    }),
    tx.shift.findMany({
      where: {
        companyId,
        employeeId,
        status: "PUBLISHED",
        startAt: { lt: new Date(to.getTime() + settings.earlyWindowHours * HOUR) },
        endAt: { gt: new Date(from.getTime() - settings.lateWindowHours * HOUR) },
      },
      select: { id: true, startAt: true, endAt: true },
    }),
    tx.payRun.findMany({
      where: {
        companyId,
        kind: "REGULAR",
        status: { in: ["FINALIZED", "PAID"] },
        periodStart: { lte: keyToUtcDate(dateKey(to, input.timezone)) },
        periodEnd: { gte: keyToUtcDate(dateKey(from, input.timezone)) },
      },
      select: { periodStart: true, periodEnd: true },
    }),
  ]);

  const insideFixed = (p: Punch) =>
    (p.timeEntryId && fixedIds.has(p.timeEntryId)) ||
    fixed.some((e) => p.at >= e.clockInAt && p.at <= (e.clockOutAt ?? e.clockInAt));
  const inLockedPeriod = (p: Punch) => {
    const day = dateKey(p.at, input.timezone);
    return lockedRuns.some((r) => day >= utcDateToKey(r.periodStart) && day <= utcDateToKey(r.periodEnd));
  };
  const lockedPunches: RebuildResult["lockedPunches"] = [];
  const punches: Punch[] = [];
  for (const p of allPunches) {
    if (insideFixed(p)) continue;
    if (inLockedPeriod(p)) {
      lockedPunches.push({ punchId: p.id, at: p.at });
      continue;
    }
    punches.push(p);
  }
  const byId = new Map(punches.map((p) => [p.id, p]));

  const paired = pairPunches(
    punches.map((p) => ({ id: p.id, at: p.at, action: p.action })),
    shifts,
    {
      maxDutyMinutes: settings.maxDutyHours * 60,
      longDutyMinutes: settings.longDutyReviewHours * 60,
      earlyWindowMinutes: settings.earlyWindowHours * 60,
      lateWindowMinutes: settings.lateWindowHours * 60,
    },
    input.now,
  );

  // Out-punch links are unique; clear them first so entries can trade punches without conflicts.
  const keep = new Set(paired.entries.map((e) => e.inPunchId));
  const stale = derived.filter((e) => !keep.has(e.inPunchId!));
  if (stale.length) await tx.timeEntry.deleteMany({ where: { id: { in: stale.map((e) => e.id) } } });
  const reused = derived.filter((e) => keep.has(e.inPunchId!));
  if (reused.length)
    await tx.timeEntry.updateMany({
      where: { id: { in: reused.map((e) => e.id) } },
      data: { outPunchId: null },
    });

  const entryByPunch = new Map<string, string>();
  const entryIds: string[] = [];
  const missingOut: RebuildResult["missingOut"] = [];
  const longDuty: RebuildResult["longDuty"] = [];
  for (const pe of paired.entries) {
    const ip = byId.get(pe.inPunchId)!;
    const op = pe.outPunchId ? byId.get(pe.outPunchId)! : null;
    const flags: string[] = [...pe.flags];
    if (op?.source === "AUTO" && settings.autoClockOutNeedsReview) flags.push("AUTO_OUT");
    if (ip.offline || op?.offline) flags.push("OFFLINE");
    const data = {
      locationId: ip.locationId ?? op?.locationId ?? null,
      shiftId: pe.shiftId,
      clockInAt: pe.inAt,
      clockOutAt: pe.outAt,
      inLat: ip.lat,
      inLng: ip.lng,
      inAccuracy: ip.accuracy,
      inSource: ip.source,
      inDeviceId: ip.deviceId,
      inIp: ip.ip,
      inPhotoKey: ip.photoKey,
      inOutsideGeofence: ip.outsideGeofence,
      outLat: op?.lat ?? null,
      outLng: op?.lng ?? null,
      outAccuracy: op?.accuracy ?? null,
      outSource: op?.source ?? null,
      outDeviceId: op?.deviceId ?? null,
      outIp: op?.ip ?? null,
      outPhotoKey: op?.photoKey ?? null,
      outOutsideGeofence: op?.outsideGeofence ?? false,
      inPunchId: pe.inPunchId,
      outPunchId: pe.outPunchId,
      flags,
      status: pe.outAt ? ("CLOSED" as const) : ("OPEN" as const),
    };
    const existing = reused.find((e) => e.inPunchId === pe.inPunchId);
    const entry = existing
      ? await tx.timeEntry.update({ where: { id: existing.id }, data, select: { id: true } })
      : await tx.timeEntry.create({ data: { ...data, companyId, employeeId }, select: { id: true } });
    await tx.break.deleteMany({ where: { timeEntryId: entry.id } });
    if (pe.breaks.length)
      await tx.break.createMany({
        data: pe.breaks.map((b) => ({
          timeEntryId: entry.id,
          startAt: b.startAt,
          endAt: b.endAt ?? pe.outAt,
          paid: false,
        })),
      });
    entryIds.push(entry.id);
    const linked = [pe.inPunchId, pe.outPunchId, ...pe.breaks.flatMap((b) => [b.startPunchId, b.endPunchId])];
    for (const id of linked) if (id) entryByPunch.set(id, entry.id);
    if (pe.flags.includes("MISSING_OUT")) missingOut.push({ entryId: entry.id, at: pe.inAt });
    if (pe.flags.includes("LONG_DUTY") && pe.outAt)
      longDuty.push({
        entryId: entry.id,
        at: pe.inAt,
        minutes: Math.round((pe.outAt.getTime() - pe.inAt.getTime()) / 60000),
      });
  }

  // Point every punch in the window at its entry (or none).
  const byEntry = new Map<string | null, string[]>();
  for (const p of punches) {
    const target = entryByPunch.get(p.id) ?? null;
    if (target === p.timeEntryId) continue;
    byEntry.set(target, [...(byEntry.get(target) ?? []), p.id]);
  }
  const allById = new Map(allPunches.map((p) => [p.id, p]));
  for (const p of lockedPunches) {
    if (allById.get(p.punchId)?.timeEntryId) byEntry.set(null, [...(byEntry.get(null) ?? []), p.punchId]);
  }
  for (const [timeEntryId, ids] of byEntry)
    await tx.punch.updateMany({ where: { id: { in: ids } }, data: { timeEntryId } });

  return {
    entryByPunch,
    resolved: paired.resolved,
    entryIds,
    missingOut,
    longDuty,
    orphans: paired.orphans,
    lockedPunches,
  };
}

/**
 * Entries made before pairing existed (or by the demo seed) have no punch links. Give them punches
 * that match their times, reusing the punches logged for them when the times agree, so they can be
 * re-paired like any other duty. Logged punches that no longer match (the entry was edited) are voided.
 */
async function adoptLegacyEntry(tx: Tx, companyId: string, employeeId: string, entryId: string) {
  const entry = await tx.timeEntry.findUniqueOrThrow({ where: { id: entryId }, include: { breaks: true } });
  const logged = await tx.punch.findMany({ where: { companyId, timeEntryId: entryId, accepted: true } });
  const used = new Set<string>();
  const ensure = async (
    action: "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END",
    at: Date,
    key: string,
    side: "in" | "out",
  ) => {
    const match = logged.find(
      (p) => p.action === action && p.at.getTime() === at.getTime() && !used.has(p.id),
    );
    if (match) {
      used.add(match.id);
      return match.id;
    }
    const created = await tx.punch.upsert({
      where: { companyId_clientId: { companyId, clientId: `legacy:${key}` } },
      update: {},
      create: {
        companyId,
        employeeId,
        clientId: `legacy:${key}`,
        action,
        at,
        source: (side === "in" ? entry.inSource : entry.outSource) ?? entry.inSource,
        lat: side === "in" ? entry.inLat : entry.outLat,
        lng: side === "in" ? entry.inLng : entry.outLng,
        accuracy: side === "in" ? entry.inAccuracy : entry.outAccuracy,
        locationId: entry.locationId,
        photoKey: side === "in" ? entry.inPhotoKey : entry.outPhotoKey,
        outsideGeofence: side === "in" ? entry.inOutsideGeofence : entry.outOutsideGeofence,
        timeEntryId: entryId,
        accepted: true,
      },
    });
    used.add(created.id);
    return created.id;
  };
  const inPunchId = await ensure("CLOCK_IN", entry.clockInAt, `${entryId}:in`, "in");
  const outPunchId = entry.clockOutAt
    ? await ensure("CLOCK_OUT", entry.clockOutAt, `${entryId}:out`, "out")
    : null;
  for (const b of entry.breaks) {
    await ensure("BREAK_START", b.startAt, `${b.id}:start`, "in");
    if (b.endAt) await ensure("BREAK_END", b.endAt, `${b.id}:end`, "in");
  }
  const stale = logged.filter((p) => !used.has(p.id)).map((p) => p.id);
  if (stale.length)
    await tx.punch.updateMany({
      where: { id: { in: stale } },
      data: { voidedAt: new Date(), voidReason: "Superseded by an edit to the entry" },
    });
  await tx.timeEntry.update({ where: { id: entryId }, data: { inPunchId, outPunchId } });
  return { inPunchId, outPunchId };
}

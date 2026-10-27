import "server-only";
import { randomUUID } from "node:crypto";
import type { Employee, Location, Prisma } from "@/generated/prisma/client";
import type { Plan, PunchAction, PunchSource } from "@/generated/prisma/enums";
import { hasFeature } from "@/lib/entitlements";
import { evaluateGeofence, formatDistance, haversineMeters, ipAllowed } from "@/lib/geo";
import { elapsedMinutes } from "@/lib/pay/hours";
import type { CompanySettings } from "@/lib/settings";
import { atMinute, dateKey, keyToUtcDate } from "@/lib/time";
import { UserError } from "../action";
import { prisma } from "../db";
import { rebuildAttendance } from "./attendance/rebuild";
import { raiseRebuildIssues } from "./exceptions";

export type PunchActor = {
  companyId: string;
  timezone: string;
  plan: Plan;
  settings: CompanySettings;
  employee: Pick<Employee, "id" | "firstName" | "lastName" | "status">;
};

export type PunchInput = {
  action: PunchAction;
  /**
   * When the punch happened. Only honored when `offline` is set (queued punches and terminals that
   * upload their own logs); live punches always use the server clock so a phone's clock can't be gamed.
   */
  at?: Date;
  offline?: boolean;
  clientId?: string;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  locationId?: string | null;
  source: PunchSource;
  deviceId?: string | null;
  ip?: string | null;
  photoKey?: string | null;
  /** Kiosk punches are bound to the kiosk's location and skip phone geofencing. */
  kioskLocationId?: string | null;
  /** FINGERPRINT, CARD, PIN, FACE, QR or GPS */
  method?: string | null;
  /** Punches the system makes itself (shift-end auto clock-out, approved corrections). */
  system?: boolean;
};

export type PunchResult = {
  /** The duty this punch belongs to; null when it couldn't be paired (e.g. a clock-out with no clock-in). */
  entryId: string | null;
  action: PunchAction;
  at: Date;
  locationName: string | null;
  warning?: string;
  /** A repeat of a punch made moments before; nothing changed. */
  duplicate?: boolean;
};

const MAX_FUTURE_MS = 2 * 60_000;
const MAX_AGE_MS = 72 * 3600_000;

type Db = Prisma.TransactionClient | typeof prisma;

async function candidateLocations(companyId: string, employeeId: string, db: Db = prisma) {
  const assigned = await db.location.findMany({
    where: { companyId, archivedAt: null, employees: { some: { employeeId } } },
    orderBy: { createdAt: "asc" },
  });
  if (assigned.length > 0) return assigned;
  return db.location.findMany({ where: { companyId, archivedAt: null }, orderBy: { createdAt: "asc" } });
}

function pickLocation(locations: Location[], input: PunchInput) {
  if (input.kioskLocationId) return locations.find((l) => l.id === input.kioskLocationId) ?? null;
  if (input.locationId) {
    const chosen = locations.find((l) => l.id === input.locationId);
    if (chosen) return chosen;
  }
  if (input.lat != null && input.lng != null) {
    const withCoords = locations.filter((l) => l.latitude != null && l.longitude != null);
    if (withCoords.length > 0) {
      return withCoords
        .map((l) => ({
          l,
          d: haversineMeters({ lat: input.lat!, lng: input.lng! }, { lat: l.latitude!, lng: l.longitude! }),
        }))
        .sort((a, b) => a.d - b.d)[0]!.l;
    }
  }
  return locations[0] ?? null;
}

/** Validate the punch against location policies. Returns a warning for soft (WARN) failures. */
function checkPolicies(actor: PunchActor, input: PunchInput, location: Location | null) {
  const isPhone = input.source === "MOBILE" || input.source === "WEB";
  const hasGps = input.lat != null && input.lng != null;
  if (isPhone && actor.settings.requireGps && !hasGps) {
    throw new UserError("Turn on location services to punch. Your company requires a GPS stamp.");
  }
  if (!location) return { outside: false };
  if (isPhone && hasFeature(actor.plan, "ipLock") && !ipAllowed(input.ip, location.allowedIps)) {
    throw new UserError(`Punches for ${location.name} must be made on the site's network.`);
  }
  if (
    hasFeature(actor.plan, "photoProof") &&
    location.requirePhoto &&
    !input.photoKey &&
    input.source !== "AUTO" &&
    (input.action === "CLOCK_IN" || input.action === "CLOCK_OUT")
  ) {
    throw new UserError("A photo is required to punch at this location.");
  }
  if (!isPhone || !hasFeature(actor.plan, "geofence")) return { outside: false };
  const point = hasGps ? { lat: input.lat!, lng: input.lng!, accuracy: input.accuracy } : null;
  const result = evaluateGeofence(point, location);
  const blocking = location.geofenceMode === "BLOCK" && input.action === "CLOCK_IN";
  if (result.status === "unknown") {
    if (blocking) throw new UserError(`Turn on location services to clock in at ${location.name}.`);
    return { outside: false, warning: "No GPS location was recorded." };
  }
  if (result.status === "outside") {
    if (blocking) {
      throw new UserError(
        `You're ${formatDistance(result.distance)} from ${location.name}. Move within ${location.radiusMeters} m to clock in.`,
      );
    }
    return {
      outside: true,
      warning: `Recorded ${formatDistance(result.distance)} outside ${location.name}.`,
    };
  }
  return { outside: false };
}

/**
 * Automatic punches come from the app's geofence watcher. They may only clock someone out of an
 * open entry at an auto clock-out location, from a GPS fix outside that location.
 */
function assertAutoClockOut(
  actor: PunchActor,
  input: PunchInput,
  open: { location: Location | null } | null,
) {
  const location = open?.location;
  if (
    input.action !== "CLOCK_OUT" ||
    !location ||
    !location.autoClockOut ||
    !hasFeature(actor.plan, "geofence")
  )
    throw new UserError("Automatic punches can only clock you out when you leave the site.");
  const point =
    input.lat != null && input.lng != null
      ? { lat: input.lat, lng: input.lng, accuracy: input.accuracy }
      : null;
  // Auto clock-out uses the site radius even when punch geofencing itself is off.
  if (evaluateGeofence(point, { ...location, geofenceMode: "WARN" }).status !== "outside")
    throw new UserError("Automatic clock-out needs a location outside the site.");
}

/** Punches can't change a pay period that payroll has already finalized. */
async function assertPeriodOpen(db: Db, actor: PunchActor, at: Date) {
  const day = keyToUtcDate(dateKey(at, actor.timezone));
  const closed = await db.payRun.findFirst({
    where: {
      companyId: actor.companyId,
      kind: "REGULAR",
      status: { in: ["FINALIZED", "PAID"] },
      periodStart: { lte: day },
      periodEnd: { gte: day },
    },
    select: { id: true },
  });
  if (closed)
    throw new UserError("Payroll for that date is already finalized. Ask HR to record it as an adjustment.");
}

async function logPunch(
  db: Db,
  actor: PunchActor,
  input: PunchInput,
  clientId: string,
  at: Date,
  result: { accepted: boolean; error?: string; entryId?: string; locationId?: string | null },
) {
  await db.punch.create({
    data: {
      companyId: actor.companyId,
      employeeId: actor.employee.id,
      clientId,
      action: input.action,
      at,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      accuracy: input.accuracy ?? null,
      source: input.source,
      locationId: result.locationId ?? null,
      deviceId: input.deviceId ?? null,
      ip: input.ip ?? null,
      photoKey: input.photoKey ?? null,
      timeEntryId: result.entryId ?? null,
      accepted: result.accepted,
      error: result.error ?? null,
    },
  });
}

/** The duty someone is on right now, if any (stale duties with no clock-out don't count). */
async function openEntryFor(db: Db, actor: PunchActor, now: Date) {
  return db.timeEntry.findFirst({
    where: {
      companyId: actor.companyId,
      employeeId: actor.employee.id,
      clockOutAt: null,
      NOT: { flags: { has: "MISSING_OUT" } },
      clockInAt: { gte: new Date(now.getTime() - actor.settings.maxDutyHours * 3600_000) },
    },
    include: { breaks: { orderBy: { startAt: "asc" } }, location: true, shift: true },
    orderBy: { clockInAt: "desc" },
  });
}

type OpenEntry = Awaited<ReturnType<typeof openEntryFor>>;

/** A duty whose shift ended well before now was never clocked out; a new clock-in may start. */
function isStale(open: NonNullable<OpenEntry>, actor: PunchActor, at: Date) {
  const s = actor.settings;
  if (open.shift) return at.getTime() > open.shift.endAt.getTime() + s.lateWindowHours * 3600_000;
  return at.getTime() - open.clockInAt.getTime() > s.longDutyReviewHours * 3600_000;
}

/** Live phone/kiosk punches must make sense against the current state. */
function validateLive(action: PunchAction, open: OpenEntry, actor: PunchActor, at: Date) {
  switch (action) {
    case "CLOCK_IN":
      if (open && !isStale(open, actor, at))
        throw new UserError("You're already clocked in. Clock out first.");
      return;
    case "CLOCK_OUT":
      if (!open) throw new UserError("You're not clocked in.");
      if (at <= open.clockInAt) throw new UserError("Clock-out must be after clock-in.");
      return;
    case "BREAK_START":
      if (!open) throw new UserError("Clock in before starting a break.");
      if (open.breaks.some((b) => b.endAt === null)) throw new UserError("You're already on a break.");
      return;
    case "BREAK_END":
      if (!open?.breaks.some((b) => b.endAt === null)) throw new UserError("You're not on a break.");
      return;
    case "TOGGLE":
      return;
  }
}

/** The same person punching again within a few minutes (any method) counts once. */
async function findDuplicate(db: Db, actor: PunchActor, action: PunchAction, at: Date) {
  const window = actor.settings.duplicatePunchMinutes * 60_000;
  if (window <= 0) return null;
  const near = await db.punch.findMany({
    where: {
      companyId: actor.companyId,
      employeeId: actor.employee.id,
      accepted: true,
      voidedAt: null,
      duplicateOfId: null,
      at: { gte: new Date(at.getTime() - window), lte: new Date(at.getTime() + window) },
    },
    orderBy: { at: "asc" },
  });
  // Only the nearest punch counts: clocking in again right after clocking out is not a repeat.
  const nearest = near.sort(
    (a, b) => Math.abs(a.at.getTime() - at.getTime()) - Math.abs(b.at.getTime() - at.getTime()),
  )[0];
  if (!nearest) return null;
  return nearest.action === action || nearest.action === "TOGGLE" || action === "TOGGLE" ? nearest : null;
}

/**
 * Record a punch. Idempotent per clientId: replaying the same punch returns the original outcome.
 * Punches for one employee are serialized with a transaction-scoped advisory lock, so concurrent
 * syncs of the same offline queue can't create duplicate entries. Every accepted punch is added to
 * the punch log and the person's entries are re-paired around it, so offline punches that arrive
 * late, terminal taps and corrections all land in the right duty.
 * Throws UserError when the punch is rejected (the rejection is still logged).
 */
export async function punch(actor: PunchActor, input: PunchInput): Promise<PunchResult> {
  if (actor.employee.status === "ARCHIVED") throw new UserError("This team member is archived.");
  const clientId = input.clientId ?? randomUUID();
  const outcome = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.employee.id}))`;
      const previous = await tx.punch.findUnique({
        where: { companyId_clientId: { companyId: actor.companyId, clientId } },
      });
      if (previous) {
        if (!previous.accepted) return { error: previous.error ?? "This punch was rejected." };
        return {
          result: {
            entryId: previous.timeEntryId,
            action: previous.action,
            at: previous.at,
            locationName: null,
          } as PunchResult,
        };
      }
      const now = new Date();
      const at = input.offline && input.at ? input.at : now;
      let locationId: string | null = null;
      try {
        if (at.getTime() > now.getTime() + MAX_FUTURE_MS)
          throw new UserError("This punch's time is in the future. Check your phone's clock.");
        if (
          input.source !== "BIOMETRIC" &&
          input.source !== "IMPORT" &&
          at.getTime() < now.getTime() - MAX_AGE_MS
        )
          throw new UserError("This punch is more than 3 days old. Ask your manager to add it.");
        // Terminal logs are facts already recorded on the device: keep them and let HR review
        // (the rebuild raises LOCKED_PERIOD_PUNCH) rather than rejecting them.
        if (!input.system && input.source !== "BIOMETRIC" && input.source !== "IMPORT")
          await assertPeriodOpen(tx, actor, at);
        const duplicate = await findDuplicate(tx, actor, input.action, at);
        const open = await openEntryFor(tx, actor, now);
        if (input.source === "AUTO" && !input.system) assertAutoClockOut(actor, input, open);
        if (!duplicate && !input.offline && !input.system) validateLive(input.action, open, actor, at);

        const locations = await candidateLocations(actor.companyId, actor.employee.id, tx);
        const location =
          input.action === "CLOCK_IN" || input.action === "TOGGLE" || !open
            ? pickLocation(locations, input)
            : (open.location ?? pickLocation(locations, input));
        locationId = location?.id ?? null;
        const policy = input.system ? { outside: false } : checkPolicies(actor, input, location);

        const row = await tx.punch.create({
          data: {
            companyId: actor.companyId,
            employeeId: actor.employee.id,
            clientId,
            action: input.action,
            at,
            lat: input.lat ?? null,
            lng: input.lng ?? null,
            accuracy: input.accuracy ?? null,
            source: input.source,
            method: input.method ?? null,
            locationId,
            deviceId: input.deviceId ?? null,
            ip: input.ip ?? null,
            photoKey: input.photoKey ?? null,
            offline: !!input.offline,
            outsideGeofence: policy.outside,
            duplicateOfId: duplicate?.id ?? null,
            accepted: true,
          },
        });
        await tx.employee.update({ where: { id: actor.employee.id }, data: { lastSeenAt: now } });
        if (duplicate) {
          return {
            result: {
              entryId: duplicate.timeEntryId,
              action: input.action,
              at,
              locationName: location?.name ?? null,
              duplicate: true,
            } as PunchResult,
          };
        }
        const rebuilt = await rebuildAttendance(tx, {
          companyId: actor.companyId,
          timezone: actor.timezone,
          settings: actor.settings,
          employeeId: actor.employee.id,
          from: at,
          to: at,
          now,
        });
        return {
          result: {
            entryId: rebuilt.entryByPunch.get(row.id) ?? null,
            action: rebuilt.resolved.get(row.id) ?? input.action,
            at,
            locationName: location?.name ?? null,
            warning: "warning" in policy ? policy.warning : undefined,
          } as PunchResult,
          rebuilt,
        };
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        await logPunch(tx, actor, input, clientId, at, { accepted: false, error: err.message, locationId });
        return { error: err.message };
      }
    },
    { timeout: 15_000 },
  );
  if ("error" in outcome) throw new UserError(outcome.error!);
  if ("rebuilt" in outcome && outcome.rebuilt)
    await raiseRebuildIssues(actor.companyId, actor.employee.id, actor.timezone, outcome.rebuilt);
  return outcome.result!;
}

export type ClockState = {
  status: "out" | "in" | "break";
  entry: {
    id: string;
    clockInAt: string;
    locationId: string | null;
    locationName: string | null;
    breakStartedAt: string | null;
    workedMinutes: number;
  } | null;
  todayMinutes: number;
  nextShift: { startAt: string; endAt: string; locationName: string } | null;
  locations: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number;
    geofenceMode: string;
    autoClockOut: boolean;
    requirePhoto: boolean;
  }[];
};

export async function getClockState(actor: PunchActor): Promise<ClockState> {
  const { companyId } = actor;
  const employeeId = actor.employee.id;
  const todayStart = atMinute(dateKey(new Date(), actor.timezone), 0, actor.timezone);
  const [open, todays, nextShift, locations] = await Promise.all([
    openEntryFor(prisma, actor, new Date()),
    prisma.timeEntry.findMany({
      where: { companyId, employeeId, clockInAt: { gte: todayStart } },
      include: { breaks: true },
    }),
    prisma.shift.findFirst({
      where: { companyId, employeeId, status: "PUBLISHED", endAt: { gte: new Date() } },
      include: { location: { select: { name: true } } },
      orderBy: { startAt: "asc" },
    }),
    candidateLocations(companyId, employeeId),
  ]);
  const openBreak = open?.breaks.find((b) => b.endAt === null) ?? null;
  return {
    status: !open ? "out" : openBreak ? "break" : "in",
    entry: open
      ? {
          id: open.id,
          clockInAt: open.clockInAt.toISOString(),
          locationId: open.locationId,
          locationName: open.location?.name ?? null,
          breakStartedAt: openBreak?.startAt.toISOString() ?? null,
          workedMinutes: elapsedMinutes(open),
        }
      : null,
    todayMinutes: todays.reduce((s, e) => s + elapsedMinutes(e), 0),
    nextShift: nextShift
      ? {
          startAt: nextShift.startAt.toISOString(),
          endAt: nextShift.endAt.toISOString(),
          locationName: nextShift.location.name,
        }
      : null,
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      latitude: l.latitude,
      longitude: l.longitude,
      radiusMeters: l.radiusMeters,
      geofenceMode: hasFeature(actor.plan, "geofence") ? l.geofenceMode : "OFF",
      autoClockOut: hasFeature(actor.plan, "geofence") && l.autoClockOut,
      requirePhoto: hasFeature(actor.plan, "photoProof") && l.requirePhoto,
    })),
  };
}

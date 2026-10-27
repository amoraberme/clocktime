import "server-only";
import { randomUUID } from "node:crypto";
import type { Employee, Location, Prisma } from "@/generated/prisma/client";
import type { Plan, PunchAction, PunchSource } from "@/generated/prisma/enums";
import { hasFeature } from "@/lib/entitlements";
import { evaluateGeofence, formatDistance, haversineMeters, ipAllowed } from "@/lib/geo";
import { elapsedMinutes } from "@/lib/pay/hours";
import type { CompanySettings } from "@/lib/settings";
import { atMinute, dateKey } from "@/lib/time";
import { UserError } from "../action";
import { prisma } from "../db";

export type PunchActor = {
  companyId: string;
  timezone: string;
  plan: Plan;
  settings: CompanySettings;
  employee: Pick<Employee, "id" | "firstName" | "lastName" | "status">;
};

export type PunchInput = {
  action: PunchAction;
  /** When the punch happened (offline punches arrive later). Defaults to now. */
  at?: Date;
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
};

export type PunchResult = {
  entryId: string;
  action: PunchAction;
  at: Date;
  locationName: string | null;
  warning?: string;
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

async function findShiftFor(db: Db, companyId: string, employeeId: string, at: Date) {
  const shifts = await db.shift.findMany({
    where: {
      companyId,
      employeeId,
      status: "PUBLISHED",
      startAt: { lte: new Date(at.getTime() + 2 * 3600_000) },
      endAt: { gte: at },
    },
    orderBy: { startAt: "asc" },
    take: 3,
  });
  return (
    shifts.sort(
      (a, b) => Math.abs(a.startAt.getTime() - at.getTime()) - Math.abs(b.startAt.getTime() - at.getTime()),
    )[0] ?? null
  );
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

/**
 * Record a punch. Idempotent per clientId: replaying the same punch returns the original outcome.
 * Punches for one employee are serialized with a transaction-scoped advisory lock, so concurrent
 * syncs of the same offline queue can't create duplicate entries.
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
            entryId: previous.timeEntryId!,
            action: previous.action,
            at: previous.at,
            locationName: null,
          } as PunchResult,
        };
      }
      const now = Date.now();
      const at = input.at ?? new Date(now);
      let locationId: string | null = null;
      try {
        if (at.getTime() > now + MAX_FUTURE_MS)
          throw new UserError("This punch's time is in the future. Check your phone's clock.");
        if (at.getTime() < now - MAX_AGE_MS)
          throw new UserError("This punch is more than 3 days old. Ask your manager to add it.");
        const result = await applyPunch(tx, actor, input, at, (id) => (locationId = id));
        await logPunch(tx, actor, input, clientId, at, {
          accepted: true,
          entryId: result.entryId,
          locationId,
        });
        await tx.employee.update({ where: { id: actor.employee.id }, data: { lastSeenAt: new Date() } });
        return { result };
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        await logPunch(tx, actor, input, clientId, at, { accepted: false, error: err.message, locationId });
        return { error: err.message };
      }
    },
    { timeout: 15_000 },
  );
  if ("error" in outcome) throw new UserError(outcome.error!);
  return outcome.result!;
}

async function applyPunch(
  db: Db,
  actor: PunchActor,
  input: PunchInput,
  at: Date,
  setLocation: (id: string | null) => void,
): Promise<PunchResult> {
  const { companyId } = actor;
  const employeeId = actor.employee.id;
  const open = await db.timeEntry.findFirst({
    where: { companyId, employeeId, clockOutAt: null },
    include: { breaks: { orderBy: { startAt: "asc" } }, location: true },
    orderBy: { clockInAt: "desc" },
  });
  const gps = { lat: input.lat ?? null, lng: input.lng ?? null, accuracy: input.accuracy ?? null };

  switch (input.action) {
    case "CLOCK_IN": {
      if (open) throw new UserError("You're already clocked in. Clock out first.");
      const last = await db.timeEntry.findFirst({
        where: { companyId, employeeId },
        orderBy: { clockOutAt: "desc" },
        select: { clockOutAt: true },
      });
      if (last?.clockOutAt && last.clockOutAt > at)
        throw new UserError("This clock-in overlaps your previous shift.");
      const locations = await candidateLocations(companyId, employeeId, db);
      const location = pickLocation(locations, input);
      setLocation(location?.id ?? null);
      const policy = checkPolicies(actor, input, location);
      const shift = await findShiftFor(db, companyId, employeeId, at);
      const entry = await db.timeEntry.create({
        data: {
          companyId,
          employeeId,
          locationId: location?.id ?? null,
          shiftId: shift?.id ?? null,
          clockInAt: at,
          inLat: gps.lat,
          inLng: gps.lng,
          inAccuracy: gps.accuracy,
          inSource: input.source,
          inDeviceId: input.deviceId ?? null,
          inIp: input.ip ?? null,
          inPhotoKey: input.photoKey ?? null,
          inOutsideGeofence: policy.outside,
          status: "OPEN",
        },
      });
      return {
        entryId: entry.id,
        action: "CLOCK_IN",
        at,
        locationName: location?.name ?? null,
        warning: policy.warning,
      };
    }
    case "CLOCK_OUT": {
      if (!open) throw new UserError("You're not clocked in.");
      if (at <= open.clockInAt) throw new UserError("Clock-out must be after clock-in.");
      setLocation(open.locationId);
      const policy = checkPolicies(actor, input, open.location);
      await Promise.all([
        db.break.updateMany({ where: { timeEntryId: open.id, endAt: null }, data: { endAt: at } }),
        db.timeEntry.update({
          where: { id: open.id },
          data: {
            clockOutAt: at,
            outLat: gps.lat,
            outLng: gps.lng,
            outAccuracy: gps.accuracy,
            outSource: input.source,
            outDeviceId: input.deviceId ?? null,
            outIp: input.ip ?? null,
            outPhotoKey: input.photoKey ?? null,
            outOutsideGeofence: policy.outside,
            status: "CLOSED",
          },
        }),
      ]);
      return {
        entryId: open.id,
        action: "CLOCK_OUT",
        at,
        locationName: open.location?.name ?? null,
        warning: policy.warning,
      };
    }
    case "BREAK_START": {
      if (!open) throw new UserError("Clock in before starting a break.");
      if (open.breaks.some((b) => b.endAt === null)) throw new UserError("You're already on a break.");
      if (at <= open.clockInAt) throw new UserError("A break can't start before clock-in.");
      setLocation(open.locationId);
      await db.break.create({ data: { timeEntryId: open.id, startAt: at, paid: false } });
      return { entryId: open.id, action: "BREAK_START", at, locationName: open.location?.name ?? null };
    }
    case "BREAK_END": {
      const current = open?.breaks.find((b) => b.endAt === null);
      if (!open || !current) throw new UserError("You're not on a break.");
      if (at <= current.startAt) throw new UserError("A break must end after it starts.");
      setLocation(open.locationId);
      await db.break.update({ where: { id: current.id }, data: { endAt: at } });
      return { entryId: open.id, action: "BREAK_END", at, locationName: open.location?.name ?? null };
    }
  }
}

export type ClockState = {
  status: "out" | "in" | "break";
  entry: {
    id: string;
    clockInAt: string;
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
  }[];
};

export async function getClockState(actor: PunchActor): Promise<ClockState> {
  const { companyId } = actor;
  const employeeId = actor.employee.id;
  const todayStart = atMinute(dateKey(new Date(), actor.timezone), 0, actor.timezone);
  const [open, todays, nextShift, locations] = await Promise.all([
    prisma.timeEntry.findFirst({
      where: { companyId, employeeId, clockOutAt: null },
      include: { breaks: true, location: { select: { name: true } } },
      orderBy: { clockInAt: "desc" },
    }),
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
    })),
  };
}

/**
 * Integrity checks on a punch (anti-buddy-punching and offline-time tampering). Pure, so each rule
 * is unit tested; the server gathers the context and stores the resulting flags on the punch.
 */
import { haversineMeters } from "../geo";

export type IntegrityFlag = "STALE_GPS" | "IMPOSSIBLE_TRAVEL" | "SHARED_DEVICE" | "CLOCK_SKEW" | "TIME_ORDER";

export const PROXY_FLAGS: IntegrityFlag[] = ["STALE_GPS", "IMPOSSIBLE_TRAVEL", "SHARED_DEVICE"];
export const TIME_FLAGS: IntegrityFlag[] = ["CLOCK_SKEW", "TIME_ORDER"];

export const INTEGRITY_LIMITS = {
  /** A GPS fix older than this when the punch is made was likely reused or spoofed */
  staleFixMs: 2 * 60_000,
  /** Faster than this between two punches can't be real travel (domestic flights aside) */
  maxSpeedKmh: 150,
  /** Short hops are GPS noise, not travel */
  minTravelMeters: 2_000,
  /** A phone whose clock was off by more than this at its last sync */
  maxClockOffsetMs: 5 * 60_000,
};

export type IntegrityInput = {
  at: Date;
  offline: boolean;
  lat?: number | null;
  lng?: number | null;
  /** When the GPS fix was taken, on the device clock */
  fixAt?: Date | null;
  /** Server minus device clock at the device's last online contact */
  clockOffsetMs?: number | null;
  /** The person's previous punch with GPS (recent) */
  previous?: { at: Date; lat: number; lng: number } | null;
  /** Another person punched from the same phone/browser recently */
  sharedDevice?: boolean;
  /** An earlier punch from this device carries a later time (or vice versa) */
  sequenceConflict?: boolean;
};

export function integrityFlags(i: IntegrityInput): IntegrityFlag[] {
  const flags: IntegrityFlag[] = [];
  const offset = i.clockOffsetMs ?? 0;
  if (i.fixAt && i.lat != null) {
    // Compare on the server clock: the fix time is on the device's clock.
    const fixServerTime = i.fixAt.getTime() + offset;
    if (i.at.getTime() - fixServerTime > INTEGRITY_LIMITS.staleFixMs) flags.push("STALE_GPS");
  }
  if (i.previous && i.lat != null && i.lng != null) {
    const meters = haversineMeters({ lat: i.lat, lng: i.lng }, { lat: i.previous.lat, lng: i.previous.lng });
    const hours = Math.abs(i.at.getTime() - i.previous.at.getTime()) / 3_600_000;
    if (
      meters > INTEGRITY_LIMITS.minTravelMeters &&
      meters / 1000 / Math.max(hours, 1 / 60) > INTEGRITY_LIMITS.maxSpeedKmh
    )
      flags.push("IMPOSSIBLE_TRAVEL");
  }
  if (i.sharedDevice) flags.push("SHARED_DEVICE");
  if (i.offline && Math.abs(offset) > INTEGRITY_LIMITS.maxClockOffsetMs) flags.push("CLOCK_SKEW");
  if (i.offline && i.sequenceConflict) flags.push("TIME_ORDER");
  return flags;
}

export const INTEGRITY_LABELS: Record<IntegrityFlag, string> = {
  STALE_GPS: "Location fix was old when punching",
  IMPOSSIBLE_TRAVEL: "Too far from the previous punch for the time between",
  SHARED_DEVICE: "Phone also used by someone else",
  CLOCK_SKEW: "Phone clock was wrong",
  TIME_ORDER: "Phone clock went backwards between punches",
};

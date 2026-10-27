export type GeoPoint = { lat: number; lng: number; accuracy?: number | null };

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type GeofenceSite = {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  geofenceMode: "OFF" | "WARN" | "BLOCK";
};

export type GeofenceResult =
  { status: "off" } | { status: "unknown" } | { status: "inside" | "outside"; distance: number };

/** GPS error (up to 100 m) is given the benefit of the doubt. */
export const MAX_ACCURACY_ALLOWANCE_M = 100;

export function evaluateGeofence(point: GeoPoint | null, site: GeofenceSite): GeofenceResult {
  if (site.geofenceMode === "OFF" || site.latitude == null || site.longitude == null)
    return { status: "off" };
  if (!point) return { status: "unknown" };
  const distance = haversineMeters(point, { lat: site.latitude, lng: site.longitude });
  const allowance = Math.min(Math.max(point.accuracy ?? 0, 0), MAX_ACCURACY_ALLOWANCE_M);
  return {
    status: distance - allowance <= site.radiusMeters ? "inside" : "outside",
    distance: Math.round(distance),
  };
}

function ipv4ToInt(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

/** True when `ip` matches any entry, each an exact address or an IPv4 CIDR range. */
export function ipAllowed(ip: string | null | undefined, allowed: string[]) {
  if (allowed.length === 0) return true;
  if (!ip) return false;
  const clean = ip.replace(/^::ffff:/, "");
  return allowed.some((rule) => {
    const r = rule.trim();
    if (!r.includes("/")) return r === clean;
    const [base, bitsRaw] = r.split("/");
    const bits = Number(bitsRaw);
    const ipInt = ipv4ToInt(clean);
    const baseInt = ipv4ToInt(base ?? "");
    if (ipInt === null || baseInt === null || !(bits >= 0 && bits <= 32)) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  });
}

export function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

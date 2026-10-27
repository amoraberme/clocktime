import { describe, expect, it } from "vitest";
import { evaluateGeofence, haversineMeters, ipAllowed } from "@/lib/geo";

const site = { latitude: 14.6417, longitude: 121.0577, radiusMeters: 150, geofenceMode: "BLOCK" as const };

describe("geo", () => {
  it("measures distance", () => {
    // ~111 m per 0.001° of latitude
    expect(haversineMeters({ lat: 14.6417, lng: 121.0577 }, { lat: 14.6427, lng: 121.0577 })).toBeCloseTo(
      111,
      0,
    );
  });

  it("evaluates geofences with GPS accuracy allowance", () => {
    expect(evaluateGeofence({ lat: 14.642, lng: 121.0577, accuracy: 10 }, site).status).toBe("inside");
    expect(evaluateGeofence({ lat: 14.6447, lng: 121.0577, accuracy: 10 }, site).status).toBe("outside");
    // 333 m away but ±200 m accuracy → allowance capped at 100 m → still outside
    expect(evaluateGeofence({ lat: 14.6447, lng: 121.0577, accuracy: 200 }, site).status).toBe("outside");
    // 222 m away, ±80 m accuracy → inside
    expect(evaluateGeofence({ lat: 14.6437, lng: 121.0577, accuracy: 80 }, site).status).toBe("inside");
    expect(evaluateGeofence(null, site).status).toBe("unknown");
    expect(evaluateGeofence(null, { ...site, geofenceMode: "OFF" }).status).toBe("off");
  });

  it("matches IP allowlists", () => {
    expect(ipAllowed("203.0.113.9", [])).toBe(true);
    expect(ipAllowed("203.0.113.9", ["203.0.113.9"])).toBe(true);
    expect(ipAllowed("203.0.113.9", ["203.0.113.0/24"])).toBe(true);
    expect(ipAllowed("::ffff:203.0.113.9", ["203.0.113.0/24"])).toBe(true);
    expect(ipAllowed("198.51.100.1", ["203.0.113.0/24"])).toBe(false);
    expect(ipAllowed(null, ["203.0.113.0/24"])).toBe(false);
  });
});

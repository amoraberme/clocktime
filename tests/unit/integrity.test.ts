import { describe, expect, it } from "vitest";
import { integrityFlags } from "@/lib/attendance/integrity";

const at = new Date("2026-10-13T08:00:00+08:00");
const minutes = (m: number) => new Date(at.getTime() + m * 60_000);

describe("punch integrity", () => {
  it("passes an ordinary punch", () => {
    expect(integrityFlags({ at, offline: false, lat: 14.55, lng: 121.02, fixAt: minutes(-0.2) })).toEqual([]);
  });

  it("flags a stale GPS fix, allowing for the phone's clock offset", () => {
    expect(integrityFlags({ at, offline: false, lat: 14.55, lng: 121.02, fixAt: minutes(-10) })).toContain(
      "STALE_GPS",
    );
    // The phone's clock runs 10 minutes slow: the fix is actually fresh.
    expect(
      integrityFlags({
        at,
        offline: false,
        lat: 14.55,
        lng: 121.02,
        fixAt: minutes(-10),
        clockOffsetMs: 10 * 60_000,
      }),
    ).toEqual([]);
  });

  it("flags impossible travel but not GPS jitter", () => {
    const manila = { at: minutes(-30), lat: 14.5547, lng: 121.0244 };
    // Manila to Cebu (~570 km) in 30 minutes
    expect(integrityFlags({ at, offline: false, lat: 10.3157, lng: 123.8854, previous: manila })).toContain(
      "IMPOSSIBLE_TRAVEL",
    );
    // 500 m away a minute later
    expect(
      integrityFlags({
        at,
        offline: false,
        lat: 14.559,
        lng: 121.0244,
        previous: { ...manila, at: minutes(-1) },
      }),
    ).toEqual([]);
  });

  it("flags shared phones and tampered offline clocks", () => {
    expect(integrityFlags({ at, offline: false, sharedDevice: true })).toEqual(["SHARED_DEVICE"]);
    expect(integrityFlags({ at, offline: true, clockOffsetMs: 40 * 60_000 })).toEqual(["CLOCK_SKEW"]);
    expect(integrityFlags({ at, offline: true, sequenceConflict: true })).toEqual(["TIME_ORDER"]);
    // Online punches use the server clock, so their device clock doesn't matter.
    expect(integrityFlags({ at, offline: false, clockOffsetMs: 40 * 60_000 })).toEqual([]);
  });
});

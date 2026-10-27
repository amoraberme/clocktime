import { describe, expect, it } from "vitest";
import { pairPunches, type PairAction, type PairPunch, type PairShift } from "@/lib/attendance/pairing";

const ST = {
  maxDutyMinutes: 36 * 60,
  longDutyMinutes: 16 * 60,
  earlyWindowMinutes: 240,
  lateWindowMinutes: 360,
};
const t = (s: string) => new Date(`${s}:00+08:00`);
let n = 0;
const p = (at: string, action: PairAction = "TOGGLE"): PairPunch => ({ id: `p${++n}`, at: t(at), action });
const shift = (id: string, start: string, end: string): PairShift => ({
  id,
  startAt: t(start),
  endAt: t(end),
});
const NOW = t("2026-10-20T00:00");

describe("pairPunches", () => {
  it("pairs explicit phone punches with a break", () => {
    const r = pairPunches(
      [
        p("2026-10-13T08:00", "CLOCK_IN"),
        p("2026-10-13T12:00", "BREAK_START"),
        p("2026-10-13T13:00", "BREAK_END"),
        p("2026-10-13T17:00", "CLOCK_OUT"),
      ],
      [],
      ST,
      NOW,
    );
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]!.breaks).toHaveLength(1);
    expect(r.entries[0]!.flags).toEqual(["UNSCHEDULED"]);
  });

  it("reads terminal taps against the schedule: first in, last out, middle pair is a break", () => {
    const s = shift("s1", "2026-10-13T08:00", "2026-10-13T17:00");
    const r = pairPunches(
      [p("2026-10-13T07:52"), p("2026-10-13T12:01"), p("2026-10-13T12:58"), p("2026-10-13T17:04")],
      [s],
      ST,
      NOW,
    );
    expect(r.entries).toHaveLength(1);
    const e = r.entries[0]!;
    expect(e.shiftId).toBe("s1");
    expect(e.inAt).toEqual(t("2026-10-13T07:52"));
    expect(e.outAt).toEqual(t("2026-10-13T17:04"));
    expect(e.breaks).toHaveLength(1);
    expect(r.orphans).toHaveLength(0);
  });

  it("pairs an overnight duty across midnight", () => {
    const s = shift("night", "2026-10-13T22:00", "2026-10-14T06:00");
    const r = pairPunches([p("2026-10-13T21:55"), p("2026-10-14T06:03")], [s], ST, NOW);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]!.shiftId).toBe("night");
    expect(r.entries[0]!.outAt).toEqual(t("2026-10-14T06:03"));
  });

  it("keeps a 24-hour guard duty as one entry and flags it for review", () => {
    const s = shift("duty", "2026-10-13T08:00", "2026-10-14T08:00");
    const r = pairPunches([p("2026-10-13T07:45"), p("2026-10-14T08:10")], [s], ST, NOW);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]!.flags).toContain("LONG_DUTY");
  });

  it("alternates unscheduled taps and splits on the max duty", () => {
    const r = pairPunches(
      [p("2026-10-13T08:00"), p("2026-10-13T17:00"), p("2026-10-15T08:00"), p("2026-10-15T17:00")],
      [],
      ST,
      NOW,
    );
    expect(r.entries).toHaveLength(2);
    expect(r.entries.every((e) => e.outAt)).toBe(true);
  });

  it("flags a missing clock-out when the next duty starts", () => {
    const r = pairPunches(
      [
        p("2026-10-13T08:00", "CLOCK_IN"),
        p("2026-10-14T08:00", "CLOCK_IN"),
        p("2026-10-14T17:00", "CLOCK_OUT"),
      ],
      [],
      ST,
      NOW,
    );
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]!.flags).toContain("MISSING_OUT");
    expect(r.entries[0]!.outAt).toBeNull();
    expect(r.entries[1]!.outAt).toEqual(t("2026-10-14T17:00"));
  });

  it("reports a clock-out with no clock-in", () => {
    const r = pairPunches([p("2026-10-13T17:00", "CLOCK_OUT")], [], ST, NOW);
    expect(r.entries).toHaveLength(0);
    expect(r.orphans[0]!.reason).toBe("NO_CLOCK_IN");
  });

  it("treats a lone tap near the shift end as a clock-out with no clock-in", () => {
    const s = shift("s1", "2026-10-13T08:00", "2026-10-13T17:00");
    const r = pairPunches([p("2026-10-13T17:02")], [s], ST, NOW);
    expect(r.orphans[0]!.reason).toBe("NO_CLOCK_IN");
  });

  it("is order-independent (late-arriving offline punches)", () => {
    const a = p("2026-10-13T08:00", "CLOCK_IN");
    const b = p("2026-10-13T17:00", "CLOCK_OUT");
    const r = pairPunches([b, a], [], ST, NOW);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]!.outPunchId).toBe(b.id);
  });

  it("links split entries (out for lunch) to the same shift", () => {
    const s = shift("s1", "2026-10-13T08:00", "2026-10-13T17:00");
    const r = pairPunches(
      [
        p("2026-10-13T08:00", "CLOCK_IN"),
        p("2026-10-13T12:00", "CLOCK_OUT"),
        p("2026-10-13T13:00", "CLOCK_IN"),
        p("2026-10-13T17:00", "CLOCK_OUT"),
      ],
      [s],
      ST,
      NOW,
    );
    expect(r.entries.map((e) => e.shiftId)).toEqual(["s1", "s1"]);
  });
});

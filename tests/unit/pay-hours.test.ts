import { describe, expect, it } from "vitest";
import { computeHours, type EntryInput, type HoursContext } from "@/lib/pay/hours";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { atMinute } from "@/lib/time";

const TZ = "Asia/Manila";
const at = (key: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return atMinute(key, h! * 60 + m!, TZ);
};
const ctx: HoursContext = {
  timezone: TZ,
  settings: { ...DEFAULT_SETTINGS, autoDeductBreak: false },
  holidays: new Map(),
  restDays: [0],
};

describe("split shifts", () => {
  it("charges lateness on the first entry and undertime on the last only", () => {
    const shift = { startAt: at("2026-10-13", "08:00"), endAt: at("2026-10-13", "17:00") };
    const entries: EntryInput[] = [
      {
        id: "a",
        clockInAt: at("2026-10-13", "08:20"),
        clockOutAt: at("2026-10-13", "12:00"),
        breaks: [],
        shift,
      },
      {
        id: "b",
        clockInAt: at("2026-10-13", "13:00"),
        clockOutAt: at("2026-10-13", "16:30"),
        breaks: [],
        shift,
      },
    ];
    const r = computeHours(entries, ctx);
    expect(r.totals.lateMinutes).toBe(20);
    expect(r.totals.undertimeMinutes).toBe(30);
  });
});

describe("extended duty", () => {
  it("splits a 30-hour duty into two 24-hour workdays with fresh regular hours", () => {
    const entries: EntryInput[] = [
      { id: "g", clockInAt: at("2026-10-13", "08:00"), clockOutAt: at("2026-10-14", "14:00"), breaks: [] },
    ];
    const r = computeHours(entries, ctx);
    expect(r.totals.workedMinutes).toBe(30 * 60);
    // Day 1: 8h regular + 16h OT. Day 2 (from 08:00 next day): 6h regular.
    expect(r.totals.regularMinutes).toBe(14 * 60);
    expect(r.totals.overtimeMinutes).toBe(16 * 60);
    expect(r.days.map((d) => d.date)).toEqual(["2026-10-13", "2026-10-14"]);
    expect(r.days[1]!.regularMinutes).toBe(6 * 60);
  });

  it("keeps an overnight shift on the date it started", () => {
    const entries: EntryInput[] = [
      { id: "n", clockInAt: at("2026-10-13", "22:00"), clockOutAt: at("2026-10-14", "06:00"), breaks: [] },
    ];
    const r = computeHours(entries, ctx);
    expect(r.days).toHaveLength(1);
    expect(r.days[0]!.date).toBe("2026-10-13");
    expect(r.totals.nightMinutes).toBe(8 * 60);
    expect(r.minutesByCalendarDate).toEqual({ "2026-10-13": 120, "2026-10-14": 360 });
  });
});

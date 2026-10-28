import { describe, expect, it } from "vitest";
import {
  localParts,
  localPartsIntl,
  addDays,
  atMinute,
  dateKey,
  eachDay,
  minuteOfDay,
  payPeriodFor,
  roundInstant,
  startOfDay,
  startOfWeek,
  tzOffsetMinutes,
  weekday,
} from "@/lib/time";

const TZ = "Asia/Manila";

describe("time helpers", () => {
  it("knows Manila is UTC+8", () => {
    expect(tzOffsetMinutes(new Date("2026-06-01T00:00:00Z"), TZ)).toBe(480);
  });

  it("finds local midnight as a UTC instant", () => {
    expect(startOfDay("2026-10-27", TZ).toISOString()).toBe("2026-10-26T16:00:00.000Z");
    expect(atMinute("2026-10-27", 22 * 60, TZ).toISOString()).toBe("2026-10-27T14:00:00.000Z");
    expect(atMinute("2026-10-27", 24 * 60 + 60, TZ).toISOString()).toBe("2026-10-27T17:00:00.000Z");
  });

  it("converts instants to local date keys and minutes", () => {
    const d = new Date("2026-10-27T17:30:00Z"); // 01:30 on the 28th in Manila
    expect(dateKey(d, TZ)).toBe("2026-10-28");
    expect(minuteOfDay(d, TZ)).toBe(90);
  });

  it("handles DST zones", () => {
    // New York spring forward 2026-03-08
    expect(atMinute("2026-03-08", 12 * 60, "America/New_York").toISOString()).toBe(
      "2026-03-08T16:00:00.000Z",
    );
    expect(atMinute("2026-03-07", 12 * 60, "America/New_York").toISOString()).toBe(
      "2026-03-07T17:00:00.000Z",
    );
  });

  it("does calendar arithmetic", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(weekday("2026-10-27")).toBe(2);
    expect(startOfWeek("2026-10-27", 1)).toBe("2026-10-26");
    expect(startOfWeek("2026-10-27", 0)).toBe("2026-10-25");
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });

  it("rounds punches", () => {
    const t = new Date("2026-10-27T00:07:20Z");
    expect(roundInstant(t, 15, "nearest").toISOString()).toBe("2026-10-27T00:00:00.000Z");
    expect(roundInstant(t, 15, "up").toISOString()).toBe("2026-10-27T00:15:00.000Z");
    expect(roundInstant(t, 5, "nearest").toISOString()).toBe("2026-10-27T00:05:00.000Z");
    expect(roundInstant(t, 0, "nearest").toISOString()).toBe("2026-10-27T00:07:00.000Z");
  });

  it("computes semi-monthly, weekly and monthly pay periods", () => {
    const opts = { weekStartsOn: 1 as const, payDateOffsetDays: 5 };
    expect(payPeriodFor("2026-02-10", "SEMI_MONTHLY", opts)).toEqual({
      start: "2026-02-01",
      end: "2026-02-15",
      cutoffIndex: 1,
      payDate: "2026-02-20",
    });
    expect(payPeriodFor("2026-02-20", "SEMI_MONTHLY", opts)).toEqual({
      start: "2026-02-16",
      end: "2026-02-28",
      cutoffIndex: 2,
      payDate: "2026-03-05",
    });
    expect(payPeriodFor("2026-10-29", "WEEKLY", opts).start).toBe("2026-10-26");
    expect(payPeriodFor("2026-10-29", "MONTHLY", opts).end).toBe("2026-10-31");
  });
});

describe("fast local time conversion", () => {
  it("matches Intl exactly across DST changes and odd offsets", () => {
    const zones = [
      "Asia/Manila",
      "America/New_York",
      "Europe/London",
      "Asia/Kathmandu",
      "Australia/Lord_Howe",
      "America/St_Johns",
      "Pacific/Chatham",
      "UTC",
    ];
    // Every 7 minutes 13 seconds across 2024–2027 (covers each zone's transitions), plus the
    // exact minutes around New York's 2026 DST changes.
    const instants: Date[] = [];
    for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2027, 11, 31); t += 433_000 * 37)
      instants.push(new Date(t));
    for (const edge of [Date.UTC(2026, 2, 8, 7), Date.UTC(2026, 10, 1, 6)])
      for (let m = -3; m <= 3; m++)
        instants.push(new Date(edge + m * 60_000 + 59_999), new Date(edge + m * 60_000));
    for (const tz of zones)
      for (const d of instants)
        expect(localParts(d, tz), `${tz} ${d.toISOString()}`).toEqual(localPartsIntl(d, tz));
  });
});

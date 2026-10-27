import { describe, expect, it } from "vitest";
import { computeGross, type GrossInput, type PayProfile } from "@/lib/pay/gross";
import { computeHours, type EntryInput, type HoursContext } from "@/lib/pay/hours";
import { PREMIUMS_DOLE, type HolidayKind } from "@/lib/pay/premiums";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { atMinute, eachDay } from "@/lib/time";

const TZ = "Asia/Manila";
const at = (key: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return atMinute(key, h! * 60 + m!, TZ);
};

let seq = 0;
function entry(
  day: string,
  from: string,
  to: string,
  opts: { breakAt?: string; breakDay?: string; breakMins?: number; toDay?: string } = {},
): EntryInput {
  const bDay = opts.breakDay ?? day;
  const breaks = opts.breakAt
    ? [
        {
          startAt: at(bDay, opts.breakAt),
          endAt: new Date(at(bDay, opts.breakAt).getTime() + (opts.breakMins ?? 60) * 60000),
          paid: false,
        },
      ]
    : [];
  return { id: `e${++seq}`, clockInAt: at(day, from), clockOutAt: at(opts.toDay ?? day, to), breaks };
}

const holidays = new Map<string, HolidayKind[]>([
  ["2026-12-24", ["SPECIAL_NON_WORKING"]],
  ["2026-12-25", ["REGULAR"]],
  ["2026-11-01", ["SPECIAL_NON_WORKING"]],
]);

const ctx: HoursContext = { timezone: TZ, settings: DEFAULT_SETTINGS, holidays, restDays: [0] };
const daily700: PayProfile = { payType: "DAILY", rateCentavos: 700_00, workDaysPerYear: 313 };

function gross(
  entries: EntryInput[],
  period: { start: string; end: string },
  extra: Partial<GrossInput> = {},
  profile = daily700,
) {
  const hours = computeHours(entries, ctx);
  return computeGross({
    profile,
    hours,
    ctx,
    premiums: PREMIUMS_DOLE,
    period: { ...period, frequency: "SEMI_MONTHLY" },
    policy: { unworkedRegularHolidayPaid: true, unworkedSpecialDayPaid: false },
    ...extra,
  });
}

const line = (r: ReturnType<typeof gross>, code: string) => r.lines.find((l) => l.code === code)?.amount ?? 0;
const oneDay = (d: string) => ({ start: d, end: d });

describe("hours classification", () => {
  it("removes a recorded lunch break", () => {
    const h = computeHours([entry("2026-10-27", "08:00", "17:00", { breakAt: "12:00" })], ctx);
    expect(h.totals).toMatchObject({
      workedMinutes: 480,
      regularMinutes: 480,
      overtimeMinutes: 0,
      breakMinutes: 60,
    });
  });

  it("auto-deducts the meal break when none was recorded", () => {
    const h = computeHours([entry("2026-10-27", "08:00", "17:00")], ctx);
    expect(h.totals.workedMinutes).toBe(480);
    expect(h.totals.breakMinutes).toBe(60);
  });

  it("does not auto-deduct on short shifts", () => {
    const h = computeHours([entry("2026-10-27", "08:00", "12:00")], ctx);
    expect(h.totals.workedMinutes).toBe(240);
  });

  it("sums multiple entries on the same day before counting overtime", () => {
    const h = computeHours(
      [entry("2026-10-27", "06:00", "11:00"), entry("2026-10-27", "13:00", "18:00")],
      ctx,
    );
    expect(h.totals).toMatchObject({ workedMinutes: 600, regularMinutes: 480, overtimeMinutes: 120 });
  });

  it("splits night hours 22:00–06:00", () => {
    const h = computeHours(
      [
        entry("2026-10-27", "22:00", "07:00", {
          toDay: "2026-10-28",
          breakAt: "02:00",
          breakDay: "2026-10-28",
        }),
      ],
      ctx,
    );
    expect(h.totals.workedMinutes).toBe(480);
    expect(h.totals.nightMinutes).toBe(420);
  });

  it("clamps early clock-ins to the shift start and measures lateness", () => {
    const e = entry("2026-10-27", "07:40", "17:00", { breakAt: "12:00" });
    e.shift = { startAt: at("2026-10-27", "08:00"), endAt: at("2026-10-27", "17:00") };
    expect(computeHours([e], ctx).totals.workedMinutes).toBe(480);
    const late = entry("2026-10-27", "08:20", "17:00", { breakAt: "12:00" });
    late.shift = e.shift;
    const h = computeHours([late], ctx);
    expect(h.totals.lateMinutes).toBe(20);
    expect(h.totals.workedMinutes).toBe(460);
  });

  it("ignores lateness inside the grace period", () => {
    const e = entry("2026-10-27", "08:04", "17:00", { breakAt: "12:00" });
    e.shift = { startAt: at("2026-10-27", "08:00"), endAt: at("2026-10-27", "17:00") };
    expect(computeHours([e], ctx).totals.lateMinutes).toBe(0);
  });

  it("skips open entries", () => {
    const h = computeHours(
      [{ id: "open", clockInAt: at("2026-10-27", "08:00"), clockOutAt: null, breaks: [] }],
      ctx,
    );
    expect(h.openEntryIds).toEqual(["open"]);
    expect(h.totals.workedMinutes).toBe(0);
  });
});

describe("gross pay for daily-rated staff (₱700/day)", () => {
  it("pays an ordinary 8-hour day", () => {
    const r = gross([entry("2026-10-27", "08:00", "17:00", { breakAt: "12:00" })], oneDay("2026-10-27"));
    expect(r.gross).toBe(700_00);
    expect(r.hourlyRate).toBe(87_50);
  });

  it("pays ordinary overtime at 125%", () => {
    const r = gross([entry("2026-10-27", "08:00", "19:00", { breakAt: "12:00" })], oneDay("2026-10-27"));
    expect(line(r, "ORDINARY_OT")).toBe(218_75);
    expect(r.gross).toBe(918_75);
  });

  it("adds 10% night differential", () => {
    const r = gross(
      [
        entry("2026-10-27", "22:00", "07:00", {
          toDay: "2026-10-28",
          breakAt: "02:00",
          breakDay: "2026-10-28",
        }),
      ],
      {
        start: "2026-10-27",
        end: "2026-10-28",
      },
    );
    expect(line(r, "BASIC")).toBe(700_00);
    expect(line(r, "NIGHT_DIFF")).toBe(61_25);
  });

  it("pays 200% for work on a regular holiday", () => {
    const r = gross([entry("2026-12-25", "08:00", "17:00", { breakAt: "12:00" })], oneDay("2026-12-25"));
    expect(line(r, "REGULAR_REG")).toBe(1400_00);
    expect(line(r, "HOLIDAY_UNWORKED")).toBe(0);
    expect(r.gross).toBe(1400_00);
  });

  it("pays an unworked regular holiday when present the workday before", () => {
    const r = gross([], oneDay("2026-12-25"), { presentDates: new Set(["2026-12-23"]) });
    expect(line(r, "HOLIDAY_UNWORKED")).toBe(700_00);
  });

  it("withholds unworked holiday pay when absent the workday before", () => {
    const r = gross([], oneDay("2026-12-25"), { presentDates: new Set() });
    expect(r.gross).toBe(0);
  });

  it("pays rest day work at 130% and its overtime at 169%", () => {
    const r = gross([entry("2026-11-08", "08:00", "18:00", { breakAt: "12:00" })], oneDay("2026-11-08"));
    expect(line(r, "REST_REG")).toBe(910_00);
    expect(line(r, "REST_OT")).toBe(147_88);
  });

  it("pays a special day falling on a rest day at 150%", () => {
    const r = gross([entry("2026-11-01", "08:00", "17:00", { breakAt: "12:00" })], oneDay("2026-11-01"));
    expect(line(r, "SPECIAL_REST_REG")).toBe(1050_00);
  });

  it("splits a night shift that crosses midnight into a holiday", () => {
    const r = gross([entry("2026-12-24", "20:00", "05:00", { toDay: "2026-12-25" })], {
      start: "2026-12-24",
      end: "2026-12-25",
    });
    expect(line(r, "SPECIAL_REG")).toBe(455_00);
    expect(line(r, "REGULAR_REG")).toBe(700_00);
    expect(line(r, "NIGHT_DIFF")).toBe(92_75);
    // Worked part of the holiday, so no extra unworked-holiday pay.
    expect(line(r, "HOLIDAY_UNWORKED")).toBe(0);
  });

  it("pays only approved overtime when approval is required", () => {
    const e = entry("2026-10-27", "08:00", "19:00", { breakAt: "12:00" });
    const r = gross([e], oneDay("2026-10-27"), { approvedOvertime: new Map([["2026-10-27", 60]]) });
    expect(line(r, "ORDINARY_OT")).toBe(109_38);
    expect(r.unapprovedOvertimeMinutes).toBe(60);
    const none = gross([e], oneDay("2026-10-27"), { approvedOvertime: new Map() });
    expect(line(none, "ORDINARY_OT")).toBe(0);
  });

  it("pays hourly staff for the minutes worked", () => {
    const r = gross(
      [entry("2026-10-27", "08:00", "12:30")],
      oneDay("2026-10-27"),
      {},
      {
        payType: "HOURLY",
        rateCentavos: 100_00,
        workDaysPerYear: 313,
      },
    );
    expect(r.gross).toBe(450_00);
  });

  it("pays paid leave days at the daily rate", () => {
    const r = gross([], oneDay("2026-10-27"), { paidLeave: new Map([["2026-10-27", 1]]) });
    expect(line(r, "LEAVE")).toBe(700_00);
    expect(r.basic).toBe(700_00);
  });
});

describe("gross pay for monthly-rated staff (₱31,300/month, 313 factor → ₱1,200/day)", () => {
  const monthly: PayProfile = { payType: "MONTHLY", rateCentavos: 31_300_00, workDaysPerYear: 313 };
  const workdays = eachDay("2026-10-16", "2026-10-31").filter((d) => ![18, 25].includes(Number(d.slice(-2))));

  it("pays half the monthly salary, minus absences, plus overtime", () => {
    const entries = workdays
      .filter((d) => d !== "2026-10-20")
      .map((d) => entry(d, "08:00", d === "2026-10-21" ? "18:00" : "17:00", { breakAt: "12:00" }));
    const r = gross(entries, { start: "2026-10-16", end: "2026-10-31" }, {}, monthly);
    expect(r.dailyRate).toBe(1200_00);
    expect(line(r, "BASIC")).toBe(15_650_00);
    expect(line(r, "ABSENCES")).toBe(-1200_00);
    expect(line(r, "ORDINARY_OT")).toBe(187_50);
    expect(r.gross).toBe(14_637_50);
  });

  it("adds only the 100% premium for regular holiday work (base is in the salary)", () => {
    const r = gross(
      [entry("2026-12-25", "08:00", "17:00", { breakAt: "12:00" })],
      oneDay("2026-12-25"),
      {},
      monthly,
    );
    expect(line(r, "REGULAR_REG")).toBe(1200_00);
  });

  it("pays rest day work in full for 313-factor employees", () => {
    const r = gross(
      [entry("2026-11-08", "08:00", "17:00", { breakAt: "12:00" })],
      oneDay("2026-11-08"),
      {},
      monthly,
    );
    expect(line(r, "REST_REG")).toBe(1560_00);
  });

  it("deducts tardiness from monthly pay", () => {
    const e = entry("2026-10-27", "08:30", "17:00", { breakAt: "12:00" });
    e.shift = { startAt: at("2026-10-27", "08:00"), endAt: at("2026-10-27", "17:00") };
    const r = gross([e], oneDay("2026-10-27"), {}, monthly);
    expect(line(r, "TARDINESS")).toBe(-75_00);
  });
});

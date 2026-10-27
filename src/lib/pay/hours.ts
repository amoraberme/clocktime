/**
 * Turns raw time entries into paid minutes, classified by day type, overtime and night
 * differential. Pure and framework-free so it can be unit tested exhaustively.
 *
 * Rules:
 * - Punches are rounded per company settings; time before a linked shift's start is not paid
 *   when clampEarlyClockIn is on.
 * - Unpaid breaks are removed. If none were recorded on a long entry, the standard meal break is
 *   deducted from the middle of the entry.
 * - Overtime = minutes beyond dailyRegularMinutes on the work date (the local date the entry
 *   started), summed across that date's entries.
 * - Day type (rest day, holidays) is decided per calendar minute, so work that crosses midnight
 *   into a holiday earns holiday rates only for the holiday hours.
 */
import type { CompanySettings } from "../settings";
import { dateKey, minuteOfDay, minutesBetween, roundInstant, weekday } from "../time";
import { classifyDay, type DayType, type HolidayKind } from "./premiums";

export type BreakInput = { startAt: Date; endAt: Date | null; paid: boolean };

export type EntryInput = {
  id: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  breaks: BreakInput[];
  shift?: { startAt: Date; endAt: Date } | null;
};

export type HoursSettings = Pick<
  CompanySettings,
  | "roundingMinutes"
  | "roundingMode"
  | "lateGraceMinutes"
  | "clampEarlyClockIn"
  | "mealBreakMinutes"
  | "autoDeductBreak"
  | "autoDeductBreakAfterMinutes"
  | "dailyRegularMinutes"
  | "nightDiffStartMinute"
  | "nightDiffEndMinute"
>;

export type HoursContext = {
  timezone: string;
  settings: HoursSettings;
  /** Holidays by date key */
  holidays: Map<string, HolidayKind[]>;
  /** Weekdays (0=Sun) that are the employee's rest days */
  restDays: number[];
};

/** Minutes keyed by `${dayType}|${REG|OT}|${ND|DAY}` */
export type BucketKey = `${DayType}|${"REG" | "OT"}|${"ND" | "DAY"}`;

export type DaySummary = {
  date: string;
  dayType: DayType;
  workedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  breakMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  entryIds: string[];
  /** Minutes by bucket for this work date (overtime approval is per day) */
  buckets: Partial<Record<BucketKey, number>>;
};

export type HoursResult = {
  buckets: Partial<Record<BucketKey, number>>;
  days: DaySummary[];
  totals: {
    workedMinutes: number;
    regularMinutes: number;
    overtimeMinutes: number;
    nightMinutes: number;
    breakMinutes: number;
    lateMinutes: number;
    undertimeMinutes: number;
    daysWorked: number;
  };
  /** Worked minutes per local calendar date (a night shift counts toward both dates) */
  minutesByCalendarDate: Record<string, number>;
  /** Entries without a clock-out, which are excluded */
  openEntryIds: string[];
};

type Interval = [number, number]; // epoch ms, half-open

function subtract(intervals: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of intervals) {
    if (cut[1] <= a || cut[0] >= b) {
      out.push([a, b]);
      continue;
    }
    if (cut[0] > a) out.push([a, cut[0]]);
    if (cut[1] < b) out.push([cut[1], b]);
  }
  return out;
}

function totalMinutes(intervals: Interval[]) {
  return intervals.reduce((s, [a, b]) => s + (b - a) / 60000, 0);
}

export function dayTypeFor(key: string, ctx: Pick<HoursContext, "holidays" | "restDays">): DayType {
  return classifyDay(ctx.holidays.get(key) ?? [], ctx.restDays.includes(weekday(key)));
}

function isNight(minute: number, start: number, end: number) {
  return start > end ? minute >= start || minute < end : minute >= start && minute < end;
}

/** Effective worked intervals of one closed entry after rounding, clamping and breaks. */
export function workedIntervals(entry: EntryInput, s: HoursSettings) {
  if (!entry.clockOutAt)
    return { intervals: [] as Interval[], breakMinutes: 0, lateMinutes: 0, undertimeMinutes: 0 };
  let start = roundInstant(entry.clockInAt, s.roundingMinutes, s.roundingMode).getTime();
  const end = roundInstant(entry.clockOutAt, s.roundingMinutes, s.roundingMode).getTime();
  let lateMinutes = 0;
  let undertimeMinutes = 0;
  if (entry.shift) {
    const shiftStart = entry.shift.startAt.getTime();
    const shiftEnd = entry.shift.endAt.getTime();
    if (s.clampEarlyClockIn && start < shiftStart) start = Math.min(shiftStart, end);
    const late = Math.round((start - shiftStart) / 60000);
    if (late > s.lateGraceMinutes) lateMinutes = late;
    if (end < shiftEnd) undertimeMinutes = Math.round((shiftEnd - end) / 60000);
  }
  if (end <= start) return { intervals: [] as Interval[], breakMinutes: 0, lateMinutes, undertimeMinutes };
  let intervals: Interval[] = [[start, end]];
  let breakMinutes = 0;
  const unpaid = entry.breaks.filter((b) => !b.paid);
  for (const br of unpaid) {
    const bEnd = (br.endAt ?? entry.clockOutAt).getTime();
    const before = totalMinutes(intervals);
    intervals = subtract(intervals, [br.startAt.getTime(), bEnd]);
    breakMinutes += before - totalMinutes(intervals);
  }
  const gross = (end - start) / 60000;
  if (
    unpaid.length === 0 &&
    s.autoDeductBreak &&
    gross > s.autoDeductBreakAfterMinutes &&
    s.mealBreakMinutes > 0
  ) {
    const mid = start + (end - start) / 2;
    const half = (s.mealBreakMinutes * 60000) / 2;
    intervals = subtract(intervals, [mid - half, mid + half]);
    breakMinutes += s.mealBreakMinutes;
  }
  return { intervals, breakMinutes: Math.round(breakMinutes), lateMinutes, undertimeMinutes };
}

export function computeHours(entries: EntryInput[], ctx: HoursContext): HoursResult {
  const s = ctx.settings;
  const buckets: Partial<Record<BucketKey, number>> = {};
  const days = new Map<string, DaySummary>();
  const regularUsed = new Map<string, number>();
  const openEntryIds: string[] = [];
  const minutesByCalendarDate: Record<string, number> = {};

  const sorted = [...entries].sort((a, b) => a.clockInAt.getTime() - b.clockInAt.getTime());
  for (const entry of sorted) {
    if (!entry.clockOutAt) {
      openEntryIds.push(entry.id);
      continue;
    }
    const { intervals, breakMinutes, lateMinutes, undertimeMinutes } = workedIntervals(entry, s);
    const workDate = dateKey(entry.clockInAt, ctx.timezone);
    let day = days.get(workDate);
    if (!day) {
      day = {
        date: workDate,
        dayType: dayTypeFor(workDate, ctx),
        workedMinutes: 0,
        regularMinutes: 0,
        overtimeMinutes: 0,
        nightMinutes: 0,
        breakMinutes: 0,
        lateMinutes: 0,
        undertimeMinutes: 0,
        entryIds: [],
        buckets: {},
      };
      days.set(workDate, day);
    }
    day.entryIds.push(entry.id);
    day.breakMinutes += breakMinutes;
    day.lateMinutes += lateMinutes;
    day.undertimeMinutes += undertimeMinutes;

    for (const [a, b] of intervals) {
      // Walk minute by minute; entries are at most a day long so this stays cheap.
      for (let t = a; t + 60000 <= b; t += 60000) {
        const instant = new Date(t);
        const calKey = dateKey(instant, ctx.timezone);
        const dayType = dayTypeFor(calKey, ctx);
        minutesByCalendarDate[calKey] = (minutesByCalendarDate[calKey] ?? 0) + 1;
        const used = regularUsed.get(workDate) ?? 0;
        const ot = used >= s.dailyRegularMinutes;
        if (!ot) regularUsed.set(workDate, used + 1);
        const nd = isNight(minuteOfDay(instant, ctx.timezone), s.nightDiffStartMinute, s.nightDiffEndMinute);
        const key: BucketKey = `${dayType}|${ot ? "OT" : "REG"}|${nd ? "ND" : "DAY"}`;
        buckets[key] = (buckets[key] ?? 0) + 1;
        day.buckets[key] = (day.buckets[key] ?? 0) + 1;
        day.workedMinutes++;
        if (ot) day.overtimeMinutes++;
        else day.regularMinutes++;
        if (nd) day.nightMinutes++;
      }
    }
  }

  const dayList = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const totals = dayList.reduce(
    (t, d) => ({
      workedMinutes: t.workedMinutes + d.workedMinutes,
      regularMinutes: t.regularMinutes + d.regularMinutes,
      overtimeMinutes: t.overtimeMinutes + d.overtimeMinutes,
      nightMinutes: t.nightMinutes + d.nightMinutes,
      breakMinutes: t.breakMinutes + d.breakMinutes,
      lateMinutes: t.lateMinutes + d.lateMinutes,
      undertimeMinutes: t.undertimeMinutes + d.undertimeMinutes,
      daysWorked: t.daysWorked + (d.workedMinutes > 0 ? 1 : 0),
    }),
    {
      workedMinutes: 0,
      regularMinutes: 0,
      overtimeMinutes: 0,
      nightMinutes: 0,
      breakMinutes: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
      daysWorked: 0,
    },
  );
  return { buckets, days: dayList, totals, minutesByCalendarDate, openEntryIds };
}

/** Elapsed minutes of an entry right now (for live dashboards), net of finished unpaid breaks. */
export function elapsedMinutes(entry: EntryInput, now = new Date()) {
  const end = entry.clockOutAt ?? now;
  let total = minutesBetween(entry.clockInAt, end);
  for (const b of entry.breaks) {
    if (b.paid) continue;
    total -= minutesBetween(b.startAt, b.endAt ?? now);
  }
  return Math.max(0, total);
}

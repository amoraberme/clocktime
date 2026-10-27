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
 *   started), summed across that date's entries. A duty longer than 24 hours is split into
 *   24-hour workdays counted from its start, and each workday earns fresh regular hours.
 * - Several entries on one shift (e.g. clocking out for lunch) are late only on the first entry
 *   and undertime only on the last.
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

/** Which shift checks apply to an entry; split shifts check lateness first and undertime last. */
export type ShiftChecks = { late: boolean; undertime: boolean };

/** Effective worked intervals of one closed entry after rounding, clamping and breaks. */
export function workedIntervals(
  entry: EntryInput,
  s: HoursSettings,
  checks: ShiftChecks = { late: true, undertime: true },
) {
  if (!entry.clockOutAt)
    return { intervals: [] as Interval[], breakMinutes: 0, lateMinutes: 0, undertimeMinutes: 0 };
  let start = roundInstant(entry.clockInAt, s.roundingMinutes, s.roundingMode).getTime();
  const end = roundInstant(entry.clockOutAt, s.roundingMinutes, s.roundingMode).getTime();
  let lateMinutes = 0;
  let undertimeMinutes = 0;
  if (entry.shift) {
    const shiftStart = entry.shift.startAt.getTime();
    const shiftEnd = entry.shift.endAt.getTime();
    if (checks.late) {
      if (s.clampEarlyClockIn && start < shiftStart) start = Math.min(shiftStart, end);
      const late = Math.round((start - shiftStart) / 60000);
      if (late > s.lateGraceMinutes) lateMinutes = late;
    }
    if (checks.undertime && end < shiftEnd) undertimeMinutes = Math.round((shiftEnd - end) / 60000);
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

const DAY_MS = 24 * 3600_000;

/** Late/undertime checks per entry: only the first and last entry of each shift. */
export function shiftChecksFor(entries: EntryInput[]) {
  const byShift = new Map<string, EntryInput[]>();
  for (const e of entries) {
    if (!e.shift || !e.clockOutAt) continue;
    const key = `${e.shift.startAt.getTime()}-${e.shift.endAt.getTime()}`;
    byShift.set(key, [...(byShift.get(key) ?? []), e]);
  }
  const checks = new Map<string, ShiftChecks>();
  for (const group of byShift.values()) {
    const sorted = [...group].sort((a, b) => a.clockInAt.getTime() - b.clockInAt.getTime());
    sorted.forEach((e, i) => checks.set(e.id, { late: i === 0, undertime: i === sorted.length - 1 }));
  }
  return checks;
}

export function computeHours(entries: EntryInput[], ctx: HoursContext): HoursResult {
  const s = ctx.settings;
  const buckets: Partial<Record<BucketKey, number>> = {};
  const days = new Map<string, DaySummary>();
  const regularUsed = new Map<string, number>();
  const openEntryIds: string[] = [];
  const minutesByCalendarDate: Record<string, number> = {};

  const dayFor = (workDate: string) => {
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
    return day;
  };

  const sorted = [...entries].sort((a, b) => a.clockInAt.getTime() - b.clockInAt.getTime());
  const checks = shiftChecksFor(sorted);
  for (const entry of sorted) {
    if (!entry.clockOutAt) {
      openEntryIds.push(entry.id);
      continue;
    }
    const { intervals, breakMinutes, lateMinutes, undertimeMinutes } = workedIntervals(
      entry,
      s,
      checks.get(entry.id),
    );
    const startMs = intervals[0]?.[0] ?? entry.clockInAt.getTime();
    const workDate = dateKey(entry.clockInAt, ctx.timezone);
    const day = dayFor(workDate);
    day.entryIds.push(entry.id);
    day.breakMinutes += breakMinutes;
    day.lateMinutes += lateMinutes;
    day.undertimeMinutes += undertimeMinutes;

    for (const [a, b] of intervals) {
      for (let t = a; t + 60000 <= b; t += 60000) {
        const instant = new Date(t);
        const calKey = dateKey(instant, ctx.timezone);
        const dayType = dayTypeFor(calKey, ctx);
        minutesByCalendarDate[calKey] = (minutesByCalendarDate[calKey] ?? 0) + 1;
        // Each 24 hours of a long duty is a new workday with its own regular hours.
        const segment = Math.floor((t - startMs) / DAY_MS);
        const segDate =
          segment === 0 ? workDate : dateKey(new Date(startMs + segment * DAY_MS), ctx.timezone);
        const segDay = segment === 0 ? day : dayFor(segDate);
        const used = regularUsed.get(segDate) ?? 0;
        const ot = used >= s.dailyRegularMinutes;
        if (!ot) regularUsed.set(segDate, used + 1);
        const nd = isNight(minuteOfDay(instant, ctx.timezone), s.nightDiffStartMinute, s.nightDiffEndMinute);
        const key: BucketKey = `${dayType}|${ot ? "OT" : "REG"}|${nd ? "ND" : "DAY"}`;
        buckets[key] = (buckets[key] ?? 0) + 1;
        segDay.buckets[key] = (segDay.buckets[key] ?? 0) + 1;
        segDay.workedMinutes++;
        if (ot) segDay.overtimeMinutes++;
        else segDay.regularMinutes++;
        if (nd) segDay.nightMinutes++;
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

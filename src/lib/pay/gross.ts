/**
 * Gross pay from classified hours, following DOLE premium rules.
 *
 * Daily- and hourly-paid staff are paid for the minutes they work, each at its day-type
 * multiplier, plus unworked regular holidays (when eligible) and paid leave.
 * Monthly-paid staff get a fixed basic for the period, minus absences and tardiness, plus the
 * premium portion for work on days already covered by their salary. The days per year factor
 * decides which days that is: 261 and 313 cover holidays but not rest days; 365 covers every day.
 */
import type { PayFrequency, PayType } from "@/generated/prisma/enums";
import { eachDay, weekday } from "../time";
import { dayTypeFor, type BucketKey, type HoursContext, type HoursResult } from "./hours";
import { DAY_TYPE_LABELS, type DayType, type PremiumTable } from "./premiums";

export type PayProfile = {
  payType: PayType;
  rateCentavos: number;
  workDaysPerYear: number;
  /** YYYY-MM-DD */
  hireDate?: string | null;
};

export type EarningLine = {
  code: string;
  label: string;
  minutes?: number;
  days?: number;
  multiplier?: number;
  amount: number;
};

export type GrossInput = {
  profile: PayProfile;
  hours: HoursResult;
  ctx: HoursContext;
  premiums: PremiumTable;
  period: { start: string; end: string; frequency: PayFrequency };
  /** Days after this aren't treated as absences or unworked holidays yet (for mid-period estimates). */
  asOf?: string;
  policy: { unworkedRegularHolidayPaid: boolean; unworkedSpecialDayPaid: boolean };
  /** Approved overtime minutes per work date. Omit to pay all overtime. */
  approvedOvertime?: Map<string, number>;
  /** Paid leave days in the period (value = 1 or 0.5) */
  paidLeave?: Map<string, number>;
  /** Dates the employee worked or was on paid leave, including the days just before the period */
  presentDates?: Set<string>;
};

export type GrossResult = {
  lines: EarningLine[];
  gross: number;
  /** Basic pay earned in the period, the base for 13th-month pay */
  basic: number;
  dailyRate: number;
  hourlyRate: number;
  unapprovedOvertimeMinutes: number;
};

export function dailyRate(profile: PayProfile, dailyRegularMinutes: number) {
  switch (profile.payType) {
    case "HOURLY":
      return (profile.rateCentavos * dailyRegularMinutes) / 60;
    case "DAILY":
      return profile.rateCentavos;
    case "MONTHLY":
      return (profile.rateCentavos * 12) / profile.workDaysPerYear;
  }
}

export function periodBasicForMonthly(monthly: number, frequency: PayFrequency) {
  if (frequency === "SEMI_MONTHLY") return monthly / 2;
  if (frequency === "WEEKLY") return (monthly * 12) / 52;
  return monthly;
}

/** Is the 100% base pay for this day type already part of a monthly salary? */
function coveredByMonthly(dayType: DayType, factor: number) {
  if (dayType === "ORDINARY") return true;
  const restDay = dayType === "REST" || dayType.endsWith("_REST");
  return restDay ? factor >= 365 : true;
}

/** Apply per-day overtime approval caps; returns adjusted buckets and the unpaid OT minutes. */
function approvedBuckets(hours: HoursResult, approved: Map<string, number> | undefined) {
  if (!approved) return { buckets: hours.buckets, unapproved: 0 };
  const buckets: Partial<Record<BucketKey, number>> = {};
  let unapproved = 0;
  for (const day of hours.days) {
    let allowance = approved.get(day.date) ?? 0;
    for (const [k, v] of Object.entries(day.buckets) as [BucketKey, number][]) {
      if (!k.includes("|OT|")) {
        buckets[k] = (buckets[k] ?? 0) + v;
        continue;
      }
      const paid = Math.min(v, allowance);
      allowance -= paid;
      unapproved += v - paid;
      if (paid > 0) buckets[k] = (buckets[k] ?? 0) + paid;
    }
  }
  return { buckets, unapproved };
}

const r = (n: number) => Math.round(n);

export function computeGross(input: GrossInput): GrossResult {
  const { profile, ctx, premiums, period } = input;
  const dailyMinutes = ctx.settings.dailyRegularMinutes;
  const daily = dailyRate(profile, dailyMinutes);
  const hourly = daily / (dailyMinutes / 60);
  const perMinute = hourly / 60;
  const monthly = profile.payType === "MONTHLY";
  const asOf = input.asOf ?? period.end;
  const { buckets, unapproved } = approvedBuckets(input.hours, input.approvedOvertime);

  const lines: EarningLine[] = [];
  let basic = 0;
  const add = (line: EarningLine) => {
    if (line.amount !== 0 || (line.minutes ?? 0) > 0) lines.push({ ...line, amount: r(line.amount) });
  };

  // Group minutes by day type and OT/regular.
  type Agg = { minutes: number; ndMinutes: number };
  const groups = new Map<string, Agg>();
  for (const [k, v] of Object.entries(buckets) as [BucketKey, number][]) {
    const [dayType, kind, nd] = k.split("|") as [DayType, "REG" | "OT", "ND" | "DAY"];
    const g = groups.get(`${dayType}|${kind}`) ?? { minutes: 0, ndMinutes: 0 };
    g.minutes += v;
    if (nd === "ND") g.ndMinutes += v;
    groups.set(`${dayType}|${kind}`, g);
  }

  if (monthly) {
    const periodBasic = periodBasicForMonthly(profile.rateCentavos, period.frequency);
    add({ code: "BASIC", label: "Basic pay", amount: periodBasic });
    basic += periodBasic;
    // Absences: ordinary working days with no work and no paid leave (and days before hire).
    let absentDays = 0;
    for (const day of eachDay(period.start, period.end)) {
      if (day > asOf) break;
      const before = profile.hireDate && day < profile.hireDate;
      const dt = dayTypeFor(day, ctx);
      if (dt !== "ORDINARY" && !before) continue;
      if (!before && ctx.restDays.includes(weekday(day))) continue;
      const worked = (input.hours.minutesByCalendarDate[day] ?? 0) > 0;
      const leave = input.paidLeave?.get(day) ?? 0;
      if (before) absentDays += 1;
      else if (!worked) absentDays += 1 - leave;
    }
    if (absentDays > 0) {
      const amount = -Math.min(periodBasic, absentDays * daily);
      add({ code: "ABSENCES", label: "Absences", days: absentDays, amount });
      basic += amount;
    }
    const lateUnder = input.hours.totals.lateMinutes + input.hours.totals.undertimeMinutes;
    if (lateUnder > 0) {
      const amount = -lateUnder * perMinute;
      add({ code: "TARDINESS", label: "Tardiness & undertime", minutes: lateUnder, amount });
      basic += amount;
    }
  } else {
    const ordinary = groups.get("ORDINARY|REG");
    if (ordinary) {
      const amount = ordinary.minutes * perMinute;
      add({
        code: "BASIC",
        label: "Basic pay (regular hours)",
        minutes: ordinary.minutes,
        multiplier: 1,
        amount,
      });
      basic += amount;
    }
    if (input.paidLeave) {
      let days = 0;
      for (const [day, v] of input.paidLeave)
        if (day >= period.start && day <= period.end && day <= asOf) days += v;
      if (days > 0) {
        add({ code: "LEAVE", label: "Paid leave", days, amount: days * daily });
        basic += days * daily;
      }
    }
  }

  // Premium and overtime lines, in a stable order.
  let ndPremium = 0;
  let ndMinutes = 0;
  for (const dayType of Object.keys(premiums.multipliers) as DayType[]) {
    for (const kind of ["REG", "OT"] as const) {
      const g = groups.get(`${dayType}|${kind}`);
      if (!g) continue;
      const mult = premiums.multipliers[dayType][kind === "OT" ? "overtime" : "regular"];
      ndPremium += g.ndMinutes * perMinute * mult * premiums.nightDiffRate;
      ndMinutes += g.ndMinutes;
      if (kind === "REG" && dayType === "ORDINARY") continue; // basic, handled above
      let payMult = mult;
      if (monthly && kind === "REG" && coveredByMonthly(dayType, profile.workDaysPerYear)) payMult = mult - 1;
      const label =
        kind === "OT"
          ? `${dayType === "ORDINARY" ? "Overtime" : `${DAY_TYPE_LABELS[dayType]} overtime`}`
          : DAY_TYPE_LABELS[dayType];
      add({
        code: `${dayType}_${kind}`,
        label: `${label} (${Math.round(mult * 100)}%)`,
        minutes: g.minutes,
        multiplier: payMult,
        amount: g.minutes * perMinute * payMult,
      });
    }
  }
  if (ndMinutes > 0) {
    add({ code: "NIGHT_DIFF", label: "Night differential (10%)", minutes: ndMinutes, amount: ndPremium });
  }

  // Unworked holidays (daily/hourly only; monthly salaries already include them).
  if (!monthly) {
    let regularDays = 0;
    let specialDays = 0;
    for (const day of eachDay(period.start, period.end)) {
      if (day > asOf) break;
      if (profile.hireDate && day < profile.hireDate) continue;
      const kinds = ctx.holidays.get(day) ?? [];
      if ((input.hours.minutesByCalendarDate[day] ?? 0) > 0) continue;
      const regularCount = kinds.filter((k) => k === "REGULAR").length;
      if (regularCount > 0 && input.policy.unworkedRegularHolidayPaid && presentBefore(day, input, ctx)) {
        regularDays += regularCount;
      } else if (
        regularCount === 0 &&
        kinds.includes("SPECIAL_NON_WORKING") &&
        input.policy.unworkedSpecialDayPaid
      ) {
        specialDays += 1;
      }
    }
    if (regularDays > 0) {
      add({
        code: "HOLIDAY_UNWORKED",
        label: "Regular holiday pay (unworked)",
        days: regularDays,
        amount: regularDays * daily,
      });
      basic += regularDays * daily;
    }
    if (specialDays > 0) {
      add({
        code: "SPECIAL_UNWORKED",
        label: "Special day pay (unworked)",
        days: specialDays,
        amount: specialDays * daily,
      });
    }
  }

  const gross = lines.reduce((s, l) => s + l.amount, 0);
  return {
    lines,
    gross,
    basic: r(basic),
    dailyRate: r(daily),
    hourlyRate: r(hourly),
    unapprovedOvertimeMinutes: unapproved,
  };
}

/**
 * DOLE eligibility for unworked regular holiday pay: present (or on paid leave) on the workday
 * immediately before the holiday. Without attendance data for that day we give the benefit of
 * the doubt.
 */
function presentBefore(holiday: string, input: GrossInput, ctx: HoursContext) {
  if (!input.presentDates) return true;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(Date.UTC(+holiday.slice(0, 4), +holiday.slice(5, 7) - 1, +holiday.slice(8, 10) - i))
      .toISOString()
      .slice(0, 10);
    if (ctx.restDays.includes(weekday(d)) || (ctx.holidays.get(d)?.length ?? 0) > 0) continue;
    if (input.profile.hireDate && d < input.profile.hireDate) return false;
    return input.presentDates.has(d);
  }
  return true;
}

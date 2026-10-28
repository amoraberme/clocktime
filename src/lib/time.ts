/**
 * Time-zone aware date helpers built on Intl (no DST assumptions).
 * A "date key" is a local calendar date string "YYYY-MM-DD" in the company's time zone.
 */
import type { PayFrequency } from "@/generated/prisma/enums";

export const DEFAULT_TZ = "Asia/Manila";

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string) {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Exact conversion through Intl (slow: pay computations call this per worked minute). */
export function localPartsIntl(instant: Date, tz: string): LocalParts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter(tz).formatToParts(instant)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS[out.weekday!] ?? 0,
  };
}

// Since 1970 every zone's UTC offset is a whole number of minutes and changes only on 15-minute
// UTC boundaries, so one Intl lookup per zone per 15 minutes gives the offset for all instants in
// between. Payroll for 1,500 people walks millions of minutes; this makes that arithmetic.
const OFFSET_BUCKET_MS = 15 * 60_000;
const offsetCache = new Map<string, Map<number, number>>();

function offsetMsAt(t: number, tz: string) {
  let zone = offsetCache.get(tz);
  if (!zone) offsetCache.set(tz, (zone = new Map()));
  const bucket = Math.floor(t / OFFSET_BUCKET_MS);
  let off = zone.get(bucket);
  if (off === undefined) {
    const p = localPartsIntl(new Date(t), tz);
    off = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
    if (zone.size > 100_000) zone.clear();
    zone.set(bucket, off);
  }
  return off;
}

/**
 * Local time minus UTC at an instant, in milliseconds (Manila = 8 h). Constant within each
 * 15-minute UTC block, so tight loops can call it once per block.
 */
export function tzOffsetMs(instant: Date, tz: string) {
  const t = instant.getTime();
  if (!(t >= 0)) {
    const p = localPartsIntl(instant, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
  }
  return offsetMsAt(t, tz);
}

export function localParts(instant: Date, tz: string): LocalParts {
  const t = instant.getTime();
  if (!(t >= 0)) return localPartsIntl(instant, tz); // pre-1970 (historic odd offsets) or invalid
  const d = new Date(t + offsetMsAt(t, tz));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    weekday: d.getUTCDay(),
  };
}

/** Offset of tz from UTC at an instant, in minutes (Manila = +480). */
export function tzOffsetMinutes(instant: Date, tz: string) {
  const p = localParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant of a local wall-clock time. */
export function zonedTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = tzOffsetMinutes(new Date(guess), tz);
  let result = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(result), tz);
  if (off2 !== off1) result = guess - off2 * 60000;
  return new Date(result);
}

export function pad(n: number, width = 2) {
  return String(n).padStart(width, "0");
}

export function dateKey(instant: Date, tz: string) {
  const p = localParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function parseKey(key: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Invalid date key: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Local midnight at the start of a date key, as a UTC instant. */
export function startOfDay(key: string, tz: string) {
  const { year, month, day } = parseKey(key);
  return zonedTime(year, month, day, 0, 0, tz);
}

/** A local minute-of-day on a date key, as a UTC instant. Minutes ≥ 1440 roll into following days. */
export function atMinute(key: string, minuteOfDay: number, tz: string) {
  const dayOffset = Math.floor(minuteOfDay / 1440);
  const m = minuteOfDay - dayOffset * 1440;
  const { year, month, day } = parseKey(addDays(key, dayOffset));
  return zonedTime(year, month, day, Math.floor(m / 60), m % 60, tz);
}

export function minuteOfDay(instant: Date, tz: string) {
  const p = localParts(instant, tz);
  return p.hour * 60 + p.minute;
}

export function addDays(key: string, days: number) {
  const { year, month, day } = parseKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string) {
  return Math.round((keyToUtcDate(b).getTime() - keyToUtcDate(a).getTime()) / 86_400_000);
}

export function weekday(key: string) {
  return keyToUtcDate(key).getUTCDay();
}

/** Convert a date key to a JS Date at UTC midnight, the form Prisma uses for @db.Date. */
export function keyToUtcDate(key: string) {
  const { year, month, day } = parseKey(key);
  return new Date(Date.UTC(year, month - 1, day));
}

export function utcDateToKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function eachDay(startKey: string, endKey: string) {
  const out: string[] = [];
  for (let k = startKey; k <= endKey; k = addDays(k, 1)) out.push(k);
  return out;
}

export function startOfWeek(key: string, weekStartsOn: 0 | 1) {
  const wd = weekday(key);
  const back = (wd - weekStartsOn + 7) % 7;
  return addDays(key, -back);
}

export function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function minutesBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

export type RoundingMode = "nearest" | "down" | "up";

/** Round an instant to a minute increment. */
export function roundInstant(instant: Date, increment: number, mode: RoundingMode) {
  if (!increment) return new Date(Math.floor(instant.getTime() / 60000) * 60000);
  const step = increment * 60000;
  const t = instant.getTime();
  const fn = mode === "down" ? Math.floor : mode === "up" ? Math.ceil : Math.round;
  return new Date(fn(t / step) * step);
}

// ───────────── Pay periods ─────────────

export type PayPeriod = { start: string; end: string; cutoffIndex: number; payDate: string };

/** The pay period containing a date. Semi-monthly = 1–15 and 16–end of month. */
export function payPeriodFor(
  key: string,
  frequency: PayFrequency,
  opts: { weekStartsOn: 0 | 1; payDateOffsetDays: number },
): PayPeriod {
  const { year, month, day } = parseKey(key);
  let start: string;
  let end: string;
  let cutoffIndex = 1;
  if (frequency === "WEEKLY") {
    start = startOfWeek(key, opts.weekStartsOn);
    end = addDays(start, 6);
  } else if (frequency === "MONTHLY") {
    start = `${year}-${pad(month)}-01`;
    end = `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`;
  } else if (day <= 15) {
    start = `${year}-${pad(month)}-01`;
    end = `${year}-${pad(month)}-15`;
  } else {
    start = `${year}-${pad(month)}-16`;
    end = `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`;
    cutoffIndex = 2;
  }
  return { start, end, cutoffIndex, payDate: addDays(end, opts.payDateOffsetDays) };
}

export function previousPayPeriod(
  p: PayPeriod,
  frequency: PayFrequency,
  opts: { weekStartsOn: 0 | 1; payDateOffsetDays: number },
) {
  return payPeriodFor(addDays(p.start, -1), frequency, opts);
}

export function nextPayPeriod(
  p: PayPeriod,
  frequency: PayFrequency,
  opts: { weekStartsOn: 0 | 1; payDateOffsetDays: number },
) {
  return payPeriodFor(addDays(p.end, 1), frequency, opts);
}

// ───────────── Formatting ─────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string, options: Intl.DateTimeFormatOptions) {
  const k = tz + JSON.stringify(options);
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat("en-PH", { timeZone: tz, ...options });
    fmtCache.set(k, f);
  }
  return f;
}

export function formatTime(instant: Date, tz: string) {
  return fmt(tz, { hour: "numeric", minute: "2-digit" }).format(instant);
}

export function formatDate(instant: Date, tz: string) {
  return fmt(tz, { month: "short", day: "numeric", year: "numeric" }).format(instant);
}

export function formatDateTime(instant: Date, tz: string) {
  return fmt(tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(instant);
}

export function formatKey(
  key: string,
  options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" },
) {
  return fmt("UTC", options).format(keyToUtcDate(key));
}

export function formatMinutes(total: number) {
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(Math.round(total));
  return `${sign}${Math.floor(abs / 60)}h ${pad(abs % 60)}m`;
}

export function formatHoursDecimal(total: number) {
  return (total / 60).toFixed(2);
}

export function minuteToLabel(m: number) {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(mm)} ${suffix}`;
}

export function parseHHMM(value: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) throw new Error(`Invalid time: ${value}`);
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) throw new Error(`Invalid time: ${value}`);
  return h * 60 + mm;
}

export function toHHMM(minute: number) {
  return `${pad(Math.floor(minute / 60) % 24)}:${pad(minute % 60)}`;
}

/** Parse an <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm") as wall-clock time in tz. */
export function parseLocalDateTime(value: string, tz: string) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) throw new Error(`Invalid date/time: ${value}`);
  return atMinute(m[1]!, Number(m[2]) * 60 + Number(m[3]), tz);
}

/** Format an instant for an <input type="datetime-local"> in tz. */
export function toLocalDateTimeInput(instant: Date, tz: string) {
  const p = localParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

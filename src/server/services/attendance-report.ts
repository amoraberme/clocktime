import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DAY_TYPE_LABELS } from "@/lib/pay/premiums";
import { dayTypeFor } from "@/lib/pay/hours";
import {
  dateKey,
  eachDay,
  formatTime,
  keyToUtcDate,
  utcDateToKey,
  weekday,
  type PayPeriod,
} from "@/lib/time";
import { fullName, groupBy, yieldEvery } from "@/lib/utils";
import type { AppContext } from "../context";
import { prisma } from "../db";
import { employeeScopeWhere } from "../scope";
import { EXCEPTION_LABELS } from "./exceptions";
import { computeEmployeePeriod, loadEntries, loadPayInputs, periodBounds, todayKey } from "./timesheets";

export type ReportFilters = {
  employeeId?: string | null;
  departmentId?: string | null;
  locationId?: string | null;
  regionId?: string | null;
  includeArchived?: boolean;
};

type Ctx = Pick<
  AppContext,
  "company" | "settings" | "plan" | "can" | "db" | "managedLocationIds" | "managedDepartmentIds"
>;

export type DailyRow = {
  employeeId: string;
  employeeNo: string;
  name: string;
  department: string;
  branch: string;
  branchCode: string;
  region: string;
  date: string;
  weekday: string;
  dayType: string;
  schedule: string;
  timeIn: string;
  timeOut: string;
  methods: string;
  workedMinutes: number;
  regularMinutes: number;
  nightMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  overtimeMinutes: number;
  approvedOvertimeMinutes: number;
  /** Rendered overtime not (yet) approved: unpaid until someone approves it */
  pendingOvertimeMinutes: number;
  leave: string;
  leaveDays: number;
  paidLeave: boolean;
  absent: boolean;
  remarks: string[];
  /** Needs HR attention: missing punches, long duty, overtime waiting for approval, open exceptions */
  needsReview: boolean;
};

export type EmployeeSummary = {
  employeeId: string;
  employeeNo: string;
  name: string;
  department: string;
  branch: string;
  branchCode: string;
  region: string;
  daysPresent: number;
  absences: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  workedMinutes: number;
  regularMinutes: number;
  nightMinutes: number;
  overtimeMinutes: number;
  approvedOvertimeMinutes: number;
  pendingOvertimeMinutes: number;
  lateCount: number;
  lateMinutes: number;
  undertimeMinutes: number;
  missingPunches: number;
  reviewItems: number;
};

export type BranchTotal = {
  region: string;
  branch: string;
  branchCode: string;
  headcount: number;
  daysPresent: number;
  absences: number;
  leaveDays: number;
  lateCount: number;
  workedMinutes: number;
  approvedOvertimeMinutes: number;
  pendingOvertimeMinutes: number;
  reviewItems: number;
};

export type AttendanceReport = {
  company: string;
  period: { start: string; end: string };
  filters: { employee?: string; department?: string; branch?: string; region?: string };
  generatedAt: Date;
  daily: DailyRow[];
  summary: EmployeeSummary[];
  branches: BranchTotal[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const METHOD_LABELS: Record<string, string> = {
  FINGERPRINT: "Fingerprint",
  CARD: "RFID card",
  PIN: "PIN",
  FACE: "Face",
  QR: "QR badge",
  GPS: "Phone (GPS)",
};
const SOURCE_LABELS: Record<string, string> = {
  MOBILE: "Phone (GPS)",
  WEB: "Web",
  KIOSK: "Kiosk",
  MANUAL: "Manual",
  AUTO: "Auto clock-out",
  API: "API",
  BIOMETRIC: "Terminal",
  IMPORT: "Imported log",
  CORRECTION: "Correction",
};
/** Overtime under this many minutes (e.g. clocking out a few minutes late) isn't flagged for review. */
const REVIEW_OT_MINUTES = 30;

/** Exceptions that need a person to look at them; lateness etc. already show in their own columns. */
const REVIEW_EXCEPTIONS = new Set([
  "MISSED_CLOCK_OUT",
  "MISSING_CLOCK_IN",
  "LONG_DUTY",
  "NO_SHOW",
  "OUTSIDE_GEOFENCE",
  "UNTRUSTED_DEVICE",
  "LOCKED_PERIOD_PUNCH",
  "OFFLINE_TIME_SUSPECT",
  "PROXY_SUSPECT",
]);

const FLAG_REMARKS: Record<string, string> = {
  MISSING_OUT: "Missing clock-out",
  LONG_DUTY: "Long duty (review)",
  AUTO_OUT: "Auto clock-out (review)",
  OFFLINE: "Synced offline",
};

/** One row per person per day of the cutoff, plus per-person and per-branch totals. */
const REPORT_TTL_MS = 60_000;
const reportCache = new Map<string, { at: number; report: Promise<AttendanceReport> }>();

/**
 * The cutoff report, shared for a minute between requests that would compute the same thing (the
 * page, the Excel export and the API for the same company, period, filters and scope). A nationwide
 * report for 1,000+ people takes seconds of CPU; HR opening it and downloading it right after
 * shouldn't pay twice, and simultaneous requests share one computation.
 */
export function cachedAttendanceReport(
  ctx: Ctx,
  period: Pick<PayPeriod, "start" | "end">,
  filters: ReportFilters = {},
): Promise<AttendanceReport> {
  const key = JSON.stringify([
    ctx.company.id,
    period.start,
    period.end,
    filters,
    ctx.managedLocationIds,
    ctx.managedDepartmentIds,
  ]);
  const now = Date.now();
  const hit = reportCache.get(key);
  if (hit && now - hit.at < REPORT_TTL_MS) return hit.report;
  for (const [k, v] of reportCache) if (now - v.at >= REPORT_TTL_MS) reportCache.delete(k);
  const report = buildAttendanceReport(ctx, period, filters);
  reportCache.set(key, { at: now, report });
  report.catch(() => reportCache.delete(key));
  return report;
}

export async function buildAttendanceReport(
  ctx: Ctx,
  period: Pick<PayPeriod, "start" | "end">,
  filters: ReportFilters = {},
): Promise<AttendanceReport> {
  const tz = ctx.company.timezone;
  const where: Prisma.EmployeeWhereInput = {
    ...employeeScopeWhere(ctx),
    ...(filters.includeArchived ? {} : { status: { not: "ARCHIVED" } }),
    ...(filters.employeeId ? { id: filters.employeeId } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
  };
  const and: Prisma.EmployeeWhereInput[] = [];
  if (filters.locationId) and.push({ locations: { some: { locationId: filters.locationId } } });
  if (filters.regionId) and.push({ locations: { some: { location: { regionId: filters.regionId } } } });
  const employees = await ctx.db.employee.findMany({
    where: and.length ? { ...where, AND: and } : where,
    include: {
      department: { select: { name: true } },
      locations: {
        include: { location: { select: { name: true, code: true, region: { select: { name: true } } } } },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const ids = employees.map((e) => e.id);
  const bounds = periodBounds(period.start, period.end, tz);
  const [entries, inputs, shifts, leaves, otRequests, exceptions, holidayRows, punchMethods, filterNames] =
    await Promise.all([
      loadEntries(ctx.company.id, ids, period.start, period.end, tz),
      loadPayInputs(ctx, ids, period),
      ctx.db.shift.findMany({
        where: { employeeId: { in: ids }, status: "PUBLISHED", startAt: bounds },
        select: { employeeId: true, startAt: true, endAt: true },
        orderBy: { startAt: "asc" },
      }),
      ctx.db.leaveRequest.findMany({
        where: {
          employeeId: { in: ids },
          status: "APPROVED",
          startDate: { lte: keyToUtcDate(period.end) },
          endDate: { gte: keyToUtcDate(period.start) },
        },
        include: { leaveType: { select: { name: true, paid: true } } },
      }),
      ctx.db.overtimeRequest.findMany({
        where: {
          employeeId: { in: ids },
          status: { in: ["APPROVED", "PENDING"] },
          date: { gte: keyToUtcDate(period.start), lte: keyToUtcDate(period.end) },
        },
      }),
      ctx.db.timeException.findMany({
        where: {
          employeeId: { in: ids },
          status: "OPEN",
          date: { gte: keyToUtcDate(period.start), lte: keyToUtcDate(period.end) },
        },
        select: { employeeId: true, date: true, type: true },
      }),
      prisma.holiday.findMany({
        where: {
          OR: [{ companyId: null }, { companyId: ctx.company.id }],
          date: { gte: keyToUtcDate(period.start), lte: keyToUtcDate(period.end) },
        },
        select: { date: true, name: true },
      }),
      ctx.db.punch.findMany({
        where: { employeeId: { in: ids }, accepted: true, voidedAt: null, at: bounds },
        select: { timeEntryId: true, method: true, source: true },
      }),
      describeFilters(ctx, filters),
    ]);

  const holidayNames = new Map<string, string[]>();
  for (const h of holidayRows) {
    const k = utcDateToKey(h.date);
    holidayNames.set(k, [...(holidayNames.get(k) ?? []), h.name]);
  }
  const methodsByEntry = new Map<string, Set<string>>();
  for (const p of punchMethods) {
    if (!p.timeEntryId) continue;
    const label = (p.method && METHOD_LABELS[p.method]) || SOURCE_LABELS[p.source] || p.source;
    methodsByEntry.set(p.timeEntryId, (methodsByEntry.get(p.timeEntryId) ?? new Set()).add(label));
  }
  const today = todayKey(ctx);
  const asOf = today < period.end ? today : undefined;
  const days = eachDay(period.start, period.end);

  const entriesBy = groupBy(entries, (e) => e.employeeId);
  const shiftsBy = groupBy(shifts, (s) => s.employeeId);
  const leavesBy = groupBy(leaves, (l) => l.employeeId);
  const exceptionsBy = groupBy(exceptions, (x) => x.employeeId);
  const pendingOtBy = groupBy(
    otRequests.filter((r) => r.status === "PENDING"),
    (r) => r.employeeId,
  );

  const daily: DailyRow[] = [];
  const summary: EmployeeSummary[] = [];
  for (const [i, emp] of employees.entries()) {
    await yieldEvery(i);
    const primary = [...emp.locations].sort((a, b) => a.location.name.localeCompare(b.location.name))[0]
      ?.location;
    const ident = {
      employeeId: emp.id,
      employeeNo: emp.employeeNo ?? "",
      name: `${emp.lastName}, ${emp.firstName}`.replace(/^, /, ""),
      department: emp.department?.name ?? "",
      branch: primary?.name ?? "",
      branchCode: primary?.code ?? "",
      region: primary?.region?.name ?? "",
    };
    const own = entriesBy.get(emp.id) ?? [];
    const { hours } = computeEmployeePeriod(ctx, emp, own, period, inputs, asOf);
    const byDay = new Map(hours.days.map((d) => [d.date, d]));
    // When overtime needs approval, someone with no approved requests has none approved.
    const approvedOt = inputs.approvedOt
      ? (inputs.approvedOt.get(emp.id) ?? new Map<string, number>())
      : null;
    const pendingOt = new Map<string, number>();
    for (const r of pendingOtBy.get(emp.id) ?? [])
      pendingOt.set(utcDateToKey(r.date), (pendingOt.get(utcDateToKey(r.date)) ?? 0) + r.minutes);
    const ownShifts = shiftsBy.get(emp.id) ?? [];
    const usesSchedule = ownShifts.length > 0;
    const ownLeave = leavesBy.get(emp.id) ?? [];
    const ownExceptions = exceptionsBy.get(emp.id) ?? [];
    const shiftsByDay = groupBy(ownShifts, (x) => dateKey(x.startAt, tz));
    const entriesByDay = groupBy(own, (e) => dateKey(e.clockInAt, tz));

    const s: EmployeeSummary = {
      ...ident,
      daysPresent: 0,
      absences: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      workedMinutes: 0,
      regularMinutes: 0,
      nightMinutes: 0,
      overtimeMinutes: 0,
      approvedOvertimeMinutes: 0,
      pendingOvertimeMinutes: 0,
      lateCount: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
      missingPunches: 0,
      reviewItems: 0,
    };
    for (const day of days) {
      const dayType = dayTypeFor(day, { holidays: inputs.holidays, restDays: emp.restDays });
      const isRest = emp.restDays.includes(weekday(day));
      const holidayLabel = holidayNames.get(day)?.join(" / ");
      const dayShifts = shiftsByDay.get(day) ?? [];
      const dayEntries = entriesByDay.get(day) ?? [];
      const sum = byDay.get(day);
      const leave = ownLeave.find((l) => day >= utcDateToKey(l.startDate) && day <= utcDateToKey(l.endDate));
      const holidayOff = (inputs.holidays.get(day) ?? []).some((h) => h !== "SPECIAL_WORKING");
      const leaveApplies = !!leave && !isRest && !holidayOff;
      const leaveDays = leaveApplies ? (leave!.days < 1 ? leave!.days : 1) : 0;
      const worked = sum?.workedMinutes ?? 0;
      const ot = sum?.overtimeMinutes ?? 0;
      const approved = approvedOt ? Math.min(ot, approvedOt.get(day) ?? 0) : ot;
      const scheduledToWork = usesSchedule ? dayShifts.length > 0 : !isRest && !holidayOff;
      const counted = day <= today;
      const absent =
        counted &&
        scheduledToWork &&
        worked === 0 &&
        dayEntries.length === 0 &&
        !leaveApplies &&
        !emp.timeExempt;

      const remarks: string[] = [];
      for (const e of dayEntries) {
        for (const f of e.flags)
          if (FLAG_REMARKS[f] && !remarks.includes(FLAG_REMARKS[f]!)) remarks.push(FLAG_REMARKS[f]!);
        if (e.inOutsideGeofence || e.outOutsideGeofence) remarks.push("Outside geofence");
        if (e.manualOverride || e.inSource === "MANUAL" || e.inSource === "CORRECTION")
          remarks.push("Edited / corrected");
      }
      const dayExceptions = ownExceptions.filter(
        (x) => utcDateToKey(x.date) === day && REVIEW_EXCEPTIONS.has(x.type),
      );
      for (const x of dayExceptions)
        if (x.type !== "MISSED_CLOCK_OUT" && x.type !== "LONG_DUTY") remarks.push(EXCEPTION_LABELS[x.type]);
      const pending = ot - approved;
      if (pending >= REVIEW_OT_MINUTES)
        remarks.push(pendingOt.get(day) ? "OT request pending" : "OT not approved");
      if (absent) remarks.push("Absent");
      if (worked > 0 && dayEntries.length === 0) remarks.push("Continuation of the previous day's duty");
      const uniqueRemarks = [...new Set(remarks)];
      const missing = dayEntries.filter((e) => !e.clockOutAt || e.flags.includes("MISSING_OUT")).length;
      const needsReview =
        missing > 0 ||
        dayEntries.some((e) => e.flags.includes("LONG_DUTY") || e.flags.includes("AUTO_OUT")) ||
        pending >= REVIEW_OT_MINUTES ||
        dayExceptions.length > 0;

      const fmtOut = (d: Date) =>
        dateKey(d, tz) === day
          ? formatTime(d, tz)
          : `${formatTime(d, tz)} (+${dayDiff(day, dateKey(d, tz))}d)`;
      daily.push({
        ...ident,
        date: day,
        weekday: WEEKDAYS[weekday(day)]!,
        dayType: holidayLabel
          ? `${DAY_TYPE_LABELS[dayType]}: ${holidayLabel}`
          : isRest
            ? "Rest day"
            : DAY_TYPE_LABELS[dayType],
        schedule:
          dayShifts.length > 0
            ? dayShifts.map((x) => `${formatTime(x.startAt, tz)}–${formatTime(x.endAt, tz)}`).join(", ")
            : isRest
              ? "Rest day"
              : "",
        timeIn: dayEntries.map((e) => formatTime(e.clockInAt, tz)).join(" / "),
        timeOut: dayEntries.map((e) => (e.clockOutAt ? fmtOut(e.clockOutAt) : "—")).join(" / "),
        methods: [...new Set(dayEntries.flatMap((e) => [...(methodsByEntry.get(e.id) ?? [])]))].join(", "),
        workedMinutes: worked,
        regularMinutes: sum?.regularMinutes ?? 0,
        nightMinutes: sum?.nightMinutes ?? 0,
        lateMinutes: sum?.lateMinutes ?? 0,
        undertimeMinutes: sum?.undertimeMinutes ?? 0,
        overtimeMinutes: ot,
        approvedOvertimeMinutes: approved,
        pendingOvertimeMinutes: ot - approved,
        leave: leaveApplies ? `${leave!.leaveType.name}${leave!.leaveType.paid ? "" : " (unpaid)"}` : "",
        leaveDays,
        paidLeave: leaveApplies && leave!.leaveType.paid,
        absent,
        remarks: uniqueRemarks,
        needsReview,
      });
      // Present = a duty started that day (the tail of a 24h+ duty doesn't count as another day).
      if ((sum?.entryIds.length ?? 0) > 0 && worked > 0) s.daysPresent++;
      if (absent) s.absences++;
      if (leaveApplies) {
        if (leave!.leaveType.paid) s.paidLeaveDays += leaveDays;
        else s.unpaidLeaveDays += leaveDays;
      }
      s.workedMinutes += worked;
      s.regularMinutes += sum?.regularMinutes ?? 0;
      s.nightMinutes += sum?.nightMinutes ?? 0;
      s.overtimeMinutes += ot;
      s.approvedOvertimeMinutes += approved;
      s.pendingOvertimeMinutes += ot - approved;
      if ((sum?.lateMinutes ?? 0) > 0) s.lateCount++;
      s.lateMinutes += sum?.lateMinutes ?? 0;
      s.undertimeMinutes += sum?.undertimeMinutes ?? 0;
      s.missingPunches += missing;
      if (needsReview) s.reviewItems++;
    }
    summary.push(s);
  }

  const branchMap = new Map<string, BranchTotal>();
  for (const s of summary) {
    const key = `${s.region}|${s.branch}`;
    const b = branchMap.get(key) ?? {
      region: s.region,
      branch: s.branch,
      branchCode: s.branchCode,
      headcount: 0,
      daysPresent: 0,
      absences: 0,
      leaveDays: 0,
      lateCount: 0,
      workedMinutes: 0,
      approvedOvertimeMinutes: 0,
      pendingOvertimeMinutes: 0,
      reviewItems: 0,
    };
    b.headcount++;
    b.daysPresent += s.daysPresent;
    b.absences += s.absences;
    b.leaveDays += s.paidLeaveDays + s.unpaidLeaveDays;
    b.lateCount += s.lateCount;
    b.workedMinutes += s.workedMinutes;
    b.approvedOvertimeMinutes += s.approvedOvertimeMinutes;
    b.pendingOvertimeMinutes += s.pendingOvertimeMinutes;
    b.reviewItems += s.reviewItems;
    branchMap.set(key, b);
  }
  const branches = [...branchMap.values()].sort(
    (a, b) => a.region.localeCompare(b.region) || a.branch.localeCompare(b.branch),
  );

  return {
    company: ctx.company.name,
    period: { start: period.start, end: period.end },
    filters: filterNames,
    generatedAt: new Date(),
    daily,
    summary,
    branches,
  };
}

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

async function describeFilters(ctx: Ctx, f: ReportFilters) {
  const [employee, department, branch, region] = await Promise.all([
    f.employeeId ? ctx.db.employee.findUnique({ where: { id: f.employeeId } }) : null,
    f.departmentId ? ctx.db.department.findUnique({ where: { id: f.departmentId } }) : null,
    f.locationId ? ctx.db.location.findUnique({ where: { id: f.locationId } }) : null,
    f.regionId ? ctx.db.region.findUnique({ where: { id: f.regionId } }) : null,
  ]);
  return {
    ...(employee ? { employee: fullName(employee) } : {}),
    ...(department ? { department: department.name } : {}),
    ...(branch ? { branch: branch.name } : {}),
    ...(region ? { region: region.name } : {}),
  };
}

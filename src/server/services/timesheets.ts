import "server-only";
import type { Employee } from "@/generated/prisma/client";
import { computeGross, type GrossResult } from "@/lib/pay/gross";
import { computeHours, type EntryInput, type HoursContext, type HoursResult } from "@/lib/pay/hours";
import { PREMIUMS_DOLE, type HolidayKind, type PremiumTable } from "@/lib/pay/premiums";
import {
  addDays,
  dateKey,
  eachDay,
  keyToUtcDate,
  payPeriodFor,
  startOfDay,
  utcDateToKey,
  weekday,
  type PayPeriod,
} from "@/lib/time";
import type { AppContext } from "../context";
import { prisma } from "../db";
import { employeeScopeWhere } from "../scope";

type Ctx = Pick<AppContext, "company" | "settings" | "plan" | "can">;

export function currentPeriod(ctx: Ctx, key?: string): PayPeriod {
  const k = key ?? dateKey(new Date(), ctx.company.timezone);
  return payPeriodFor(k, ctx.company.payFrequency, {
    weekStartsOn: ctx.settings.weekStartsOn,
    payDateOffsetDays: ctx.settings.payDateOffsetDays,
  });
}

export async function loadHolidays(companyId: string, start: string, end: string) {
  const rows = await prisma.holiday.findMany({
    where: {
      OR: [{ companyId: null }, { companyId }],
      date: { gte: keyToUtcDate(start), lte: keyToUtcDate(end) },
    },
  });
  const map = new Map<string, HolidayKind[]>();
  for (const h of rows) {
    const k = utcDateToKey(h.date);
    map.set(k, [...(map.get(k) ?? []), h.type]);
  }
  return map;
}

export async function loadPremiums(): Promise<{ table: PremiumTable; version: string }> {
  const row = await prisma.statutoryTable.findFirst({
    where: { kind: "PREMIUMS", effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
  });
  return row
    ? { table: row.data as unknown as PremiumTable, version: row.version }
    : { table: PREMIUMS_DOLE, version: "built-in" };
}

/** UTC bounds covering whole local days start..end. */
export function periodBounds(start: string, end: string, tz: string) {
  return { gte: startOfDay(start, tz), lt: startOfDay(addDays(end, 1), tz) };
}

export type PeriodEntry = Awaited<ReturnType<typeof loadEntries>>[number];

export async function loadEntries(
  companyId: string,
  employeeIds: string[],
  start: string,
  end: string,
  tz: string,
) {
  return prisma.timeEntry.findMany({
    where: { companyId, employeeId: { in: employeeIds }, clockInAt: periodBounds(start, end, tz) },
    include: {
      breaks: { orderBy: { startAt: "asc" } },
      shift: { select: { startAt: true, endAt: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: { clockInAt: "asc" },
  });
}

type PayInputs = {
  holidays: Map<string, HolidayKind[]>;
  premiums: PremiumTable;
  approvedOt: Map<string, Map<string, number>> | null;
  paidLeave: Map<string, Map<string, number>>;
  presentDates: Map<string, Set<string>>;
};

/** Load everything the pay engine needs for a set of employees and a period. */
export async function loadPayInputs(
  ctx: Ctx,
  employeeIds: string[],
  period: { start: string; end: string },
): Promise<PayInputs> {
  const companyId = ctx.company.id;
  const lookback = addDays(period.start, -7);
  const [holidays, premiums, otRows, leaveRows, priorEntries] = await Promise.all([
    // Look past the period end so a night shift on the last day still sees a holiday after midnight.
    loadHolidays(companyId, lookback, addDays(period.end, 3)),
    loadPremiums(),
    ctx.settings.overtimeRequiresApproval && ctx.can("overtime")
      ? prisma.overtimeRequest.findMany({
          where: {
            companyId,
            employeeId: { in: employeeIds },
            status: "APPROVED",
            date: { gte: keyToUtcDate(period.start), lte: keyToUtcDate(period.end) },
          },
        })
      : Promise.resolve(null),
    prisma.leaveRequest.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        status: "APPROVED",
        leaveType: { paid: true },
        startDate: { lte: keyToUtcDate(period.end) },
        endDate: { gte: keyToUtcDate(lookback) },
      },
    }),
    prisma.timeEntry.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        clockInAt: periodBounds(lookback, period.end, ctx.company.timezone),
      },
      select: { employeeId: true, clockInAt: true },
    }),
  ]);
  const approvedOt = otRows ? new Map<string, Map<string, number>>() : null;
  for (const r of otRows ?? []) {
    const m = approvedOt!.get(r.employeeId) ?? new Map<string, number>();
    const k = utcDateToKey(r.date);
    m.set(k, (m.get(k) ?? 0) + r.minutes);
    approvedOt!.set(r.employeeId, m);
  }
  const paidLeave = new Map<string, Map<string, number>>();
  const presentDates = new Map<string, Set<string>>();
  for (const l of leaveRows) {
    const m = paidLeave.get(l.employeeId) ?? new Map<string, number>();
    const days = eachDay(utcDateToKey(l.startDate), utcDateToKey(l.endDate));
    const perDay = days.length === 1 && l.days < 1 ? l.days : 1;
    for (const d of days) {
      m.set(d, perDay);
      const p = presentDates.get(l.employeeId) ?? new Set<string>();
      p.add(d);
      presentDates.set(l.employeeId, p);
    }
    paidLeave.set(l.employeeId, m);
  }
  for (const e of priorEntries) {
    const p = presentDates.get(e.employeeId) ?? new Set<string>();
    p.add(dateKey(e.clockInAt, ctx.company.timezone));
    presentDates.set(e.employeeId, p);
  }
  return { holidays, premiums: premiums.table, approvedOt, paidLeave, presentDates };
}

export function toEntryInput(e: PeriodEntry): EntryInput {
  return { id: e.id, clockInAt: e.clockInAt, clockOutAt: e.clockOutAt, breaks: e.breaks, shift: e.shift };
}

export type EmployeePeriod = { hours: HoursResult; gross: GrossResult };

export function computeEmployeePeriod(
  ctx: Ctx,
  employee: Pick<
    Employee,
    "id" | "payType" | "rateCentavos" | "workDaysPerYear" | "restDays" | "hireDate" | "timeExempt"
  >,
  entries: PeriodEntry[],
  period: { start: string; end: string },
  inputs: PayInputs,
  asOf?: string,
): EmployeePeriod {
  const hoursCtx: HoursContext = {
    timezone: ctx.company.timezone,
    settings: ctx.settings,
    holidays: inputs.holidays,
    restDays: employee.restDays,
  };
  const hours = computeHours(entries.map(toEntryInput), hoursCtx);
  const gross = computeGross({
    profile: {
      payType: employee.payType,
      rateCentavos: employee.rateCentavos,
      workDaysPerYear: employee.workDaysPerYear,
      hireDate: employee.hireDate ? utcDateToKey(employee.hireDate) : null,
      timeExempt: employee.timeExempt && employee.payType === "MONTHLY",
    },
    hours,
    ctx: hoursCtx,
    premiums: inputs.premiums,
    period: { ...period, frequency: ctx.company.payFrequency },
    asOf,
    policy: {
      unworkedRegularHolidayPaid: ctx.settings.unworkedRegularHolidayPaid,
      unworkedSpecialDayPaid: ctx.settings.unworkedSpecialDayPaid,
    },
    approvedOvertime: inputs.approvedOt ? (inputs.approvedOt.get(employee.id) ?? new Map()) : undefined,
    paidLeave: workingDaysOnly(inputs.paidLeave.get(employee.id), employee.restDays, inputs.holidays),
    presentDates: inputs.presentDates.get(employee.id) ?? new Set(),
  });
  return { hours, gross };
}

/** Paid leave covers working days only, matching how requestLeave counts days against the balance. */
export function workingDaysOnly(
  leave: Map<string, number> | undefined,
  restDays: number[],
  holidays: Map<string, HolidayKind[]>,
) {
  if (!leave) return leave;
  const out = new Map<string, number>();
  for (const [d, v] of leave) {
    if (restDays.includes(weekday(d))) continue;
    if ((holidays.get(d) ?? []).some((h) => h !== "SPECIAL_WORKING")) continue;
    out.set(d, v);
  }
  return out;
}

/** Today in the company time zone, used to avoid counting future days as absences. */
export function todayKey(ctx: Ctx) {
  return dateKey(new Date(), ctx.company.timezone);
}

export async function teamPeriodSummary(ctx: AppContext, period: { start: string; end: string }) {
  const employees = await ctx.db.employee.findMany({
    where: {
      status: { not: "ARCHIVED" },
      ...employeeScopeWhere(ctx),
    },
    include: { position: { select: { name: true, color: true } } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  const ids = employees.map((e) => e.id);
  const [entries, inputs, timesheets, exceptions] = await Promise.all([
    loadEntries(ctx.company.id, ids, period.start, period.end, ctx.company.timezone),
    loadPayInputs(ctx, ids, period),
    ctx.db.timesheet.findMany({
      where: { periodStart: keyToUtcDate(period.start), employeeId: { in: ids } },
    }),
    ctx.db.timeException.groupBy({
      by: ["employeeId"],
      where: { status: "OPEN", date: { gte: keyToUtcDate(period.start), lte: keyToUtcDate(period.end) } },
      _count: true,
    }),
  ]);
  const asOf = todayKey(ctx);
  return employees.map((emp) => {
    const own = entries.filter((e) => e.employeeId === emp.id);
    const result = computeEmployeePeriod(ctx, emp, own, period, inputs, asOf < period.end ? asOf : undefined);
    return {
      employee: emp,
      entries: own,
      ...result,
      timesheet: timesheets.find((t) => t.employeeId === emp.id) ?? null,
      openExceptions: exceptions.find((x) => x.employeeId === emp.id)?._count ?? 0,
    };
  });
}

import "server-only";
import { computeGross } from "@/lib/pay/gross";
import { computeHours } from "@/lib/pay/hours";
import { addDays, dateKey, startOfWeek, utcDateToKey } from "@/lib/time";
import type { AppContext } from "../context";
import { loadEntries, loadPayInputs, periodBounds, toEntryInput } from "../services/timesheets";

export type WeekRow = {
  week: string;
  scheduled: number;
  worked: number;
  overtime: number;
  late: number;
  cost: number;
};

/** Weekly labor metrics for the last `weeks` weeks (minutes and centavos). */
export async function insightsData(ctx: AppContext, weeks: number, locationId?: string | null) {
  const tz = ctx.company.timezone;
  const today = dateKey(new Date(), tz);
  const lastWeek = startOfWeek(today, ctx.settings.weekStartsOn);
  const firstWeek = addDays(lastWeek, -7 * (weeks - 1));
  const end = addDays(lastWeek, 6);
  const employees = await ctx.db.employee.findMany({
    where: { status: { not: "ARCHIVED" }, ...(locationId ? { locations: { some: { locationId } } } : {}) },
    orderBy: [{ firstName: "asc" }],
  });
  const ids = employees.map((e) => e.id);
  const [entries, shifts, inputs] = await Promise.all([
    loadEntries(ctx.company.id, ids, firstWeek, end, tz),
    ctx.db.shift.findMany({
      where: {
        employeeId: { in: ids },
        status: "PUBLISHED",
        startAt: periodBounds(firstWeek, end, tz),
        ...(locationId ? { locationId } : {}),
      },
    }),
    loadPayInputs(ctx, ids, { start: firstWeek, end }),
  ]);
  const weekKeys = Array.from({ length: weeks }, (_, i) => addDays(firstWeek, i * 7));
  const rows: WeekRow[] = weekKeys.map((week) => ({
    week,
    scheduled: 0,
    worked: 0,
    overtime: 0,
    late: 0,
    cost: 0,
  }));
  const people = employees.map((e) => ({
    employee: e,
    scheduled: 0,
    worked: 0,
    overtime: 0,
    late: 0,
    cost: 0,
  }));

  for (const [ei, emp] of employees.entries()) {
    // Only shifts that have started, so the current week compares like with like.
    const ownShifts = shifts.filter((s) => s.employeeId === emp.id && s.startAt <= new Date());
    for (const s of ownShifts) {
      const w = rows.find((r) => r.week === startOfWeek(dateKey(s.startAt, tz), ctx.settings.weekStartsOn));
      const paid = Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60000) - s.breakMinutes;
      if (w) w.scheduled += paid;
      people[ei]!.scheduled += paid;
    }
    for (const row of rows) {
      const weekEnd = addDays(row.week, 6);
      const own = entries.filter(
        (e) =>
          e.employeeId === emp.id &&
          e.clockOutAt &&
          dateKey(e.clockInAt, tz) >= row.week &&
          dateKey(e.clockInAt, tz) <= weekEnd,
      );
      if (own.length === 0) continue;
      const hctx = {
        timezone: tz,
        settings: ctx.settings,
        holidays: inputs.holidays,
        restDays: emp.restDays,
      };
      const hours = computeHours(own.map(toEntryInput), hctx);
      const gross = computeGross({
        profile: {
          payType: emp.payType,
          rateCentavos: emp.rateCentavos,
          workDaysPerYear: emp.workDaysPerYear,
          hireDate: emp.hireDate ? utcDateToKey(emp.hireDate) : null,
          timeExempt: emp.timeExempt && emp.payType === "MONTHLY",
        },
        hours,
        ctx: hctx,
        premiums: inputs.premiums,
        period: { start: row.week, end: weekEnd, frequency: "WEEKLY" },
        asOf: today < weekEnd ? today : undefined,
        policy: {
          unworkedRegularHolidayPaid: ctx.settings.unworkedRegularHolidayPaid,
          unworkedSpecialDayPaid: ctx.settings.unworkedSpecialDayPaid,
        },
        presentDates: inputs.presentDates.get(emp.id),
      });
      const late = hours.days.filter((d) => d.lateMinutes > 0).length;
      row.worked += hours.totals.workedMinutes;
      row.overtime += hours.totals.overtimeMinutes;
      row.late += late;
      row.cost += gross.gross;
      const p = people[ei]!;
      p.worked += hours.totals.workedMinutes;
      p.overtime += hours.totals.overtimeMinutes;
      p.late += late;
      p.cost += gross.gross;
    }
  }
  return { rows, people: people.filter((p) => p.scheduled || p.worked), range: { start: firstWeek, end } };
}

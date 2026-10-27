import { csvResponse } from "@/lib/csv";
import { centavosToPesos } from "@/lib/money";
import { dateKey, formatHoursDecimal, formatTime } from "@/lib/time";
import { getContextOrThrow } from "@/server/context";
import { currentPeriod, teamPeriodSummary } from "@/server/services/timesheets";

export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await getContextOrThrow("MANAGER");
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const period = currentPeriod(ctx, url.searchParams.get("start") ?? undefined);
  const format = url.searchParams.get("format") === "detail" ? "detail" : "summary";
  const rows = await teamPeriodSummary(ctx, period);
  const tz = ctx.company.timezone;
  const name = `${ctx.company.slug}-timesheets-${period.start}_${period.end}-${format}.csv`;

  if (format === "detail") {
    const out: (string | number | null)[][] = [
      ["Employee No", "Name", "Date", "Clock In", "Clock Out", "Break (min)", "Location", "Source", "Status"],
    ];
    for (const r of rows) {
      for (const e of r.entries) {
        const breakMin = e.breaks.reduce(
          (s, b) => s + (b.endAt ? Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60000) : 0),
          0,
        );
        out.push([
          r.employee.employeeNo,
          `${r.employee.firstName} ${r.employee.lastName}`,
          dateKey(e.clockInAt, tz),
          formatTime(e.clockInAt, tz),
          e.clockOutAt ? formatTime(e.clockOutAt, tz) : "",
          breakMin,
          e.location?.name ?? "",
          e.inSource,
          e.status,
        ]);
      }
    }
    return csvResponse(name, out);
  }

  const out: (string | number | null)[][] = [
    [
      "Employee No",
      "Name",
      "Pay Type",
      "Rate (PHP)",
      "Days Worked",
      "Worked Hours",
      "Regular Hours",
      "Overtime Hours",
      "Night Diff Hours",
      "Late (min)",
      "Gross Estimate (PHP)",
      "Timesheet Status",
    ],
  ];
  for (const r of rows) {
    out.push([
      r.employee.employeeNo,
      `${r.employee.firstName} ${r.employee.lastName}`,
      r.employee.payType,
      centavosToPesos(r.employee.rateCentavos).toFixed(2),
      r.hours.totals.daysWorked,
      formatHoursDecimal(r.hours.totals.workedMinutes),
      formatHoursDecimal(r.hours.totals.regularMinutes),
      formatHoursDecimal(r.hours.totals.overtimeMinutes),
      formatHoursDecimal(r.hours.totals.nightMinutes),
      r.hours.totals.lateMinutes,
      centavosToPesos(r.gross.gross).toFixed(2),
      r.timesheet?.status ?? "PENDING",
    ]);
  }
  return csvResponse(name, out);
}

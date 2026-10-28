import { csvResponse } from "@/lib/csv";
import { centavosToPesos } from "@/lib/money";
import { dateKey, formatHoursDecimal, formatTime } from "@/lib/time";
import { actorFrom, writeAudit } from "@/server/audit";
import { getContextOrThrow } from "@/server/context";
import { currentPeriod, teamPeriodSummary } from "@/server/services/timesheets";

// Nationwide workbooks for thousands of people take a while to build.
export const maxDuration = 120;

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
  const pay = ctx.canViewPay;
  await writeAudit(actorFrom(ctx), {
    action: "timesheets.export",
    entityType: "Timesheet",
    after: { period, format, rows: rows.length },
  });
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
      ...(pay ? ["Pay Type", "Rate (PHP)"] : []),
      "Days Worked",
      "Worked Hours",
      "Regular Hours",
      "Overtime Hours",
      "Night Diff Hours",
      "Late (min)",
      "Undertime (min)",
      ...(pay ? ["Gross Estimate (PHP)"] : []),
      "Timesheet Status",
    ],
  ];
  for (const r of rows) {
    out.push([
      r.employee.employeeNo,
      `${r.employee.firstName} ${r.employee.lastName}`,
      ...(pay ? [r.employee.payType, centavosToPesos(r.employee.rateCentavos).toFixed(2)] : []),
      r.hours.totals.daysWorked,
      formatHoursDecimal(r.hours.totals.workedMinutes),
      formatHoursDecimal(r.hours.totals.regularMinutes),
      formatHoursDecimal(r.hours.totals.overtimeMinutes),
      formatHoursDecimal(r.hours.totals.nightMinutes),
      r.hours.totals.lateMinutes,
      r.hours.totals.undertimeMinutes,
      ...(pay ? [centavosToPesos(r.gross.gross).toFixed(2)] : []),
      r.timesheet?.status ?? "PENDING",
    ]);
  }
  return csvResponse(name, out);
}

import { csvResponse } from "@/lib/csv";
import { actorFrom, writeAudit } from "@/server/audit";
import { getContextOrThrow } from "@/server/context";
import {
  attendanceCsvRows,
  attendanceWorkbook,
  REPORT_SHEETS,
  type ReportSheet,
} from "@/server/reports/attendance-workbook";
import { filtersFromParams } from "@/server/reports/report-params";
import { buildAttendanceReport } from "@/server/services/attendance-report";
import { currentPeriod } from "@/server/services/timesheets";

/** Cutoff attendance report: Excel workbook (all sheets) or one sheet as CSV. */
export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await getContextOrThrow("MANAGER");
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!ctx.can("attendanceReports")) return new Response("Reports need the Starter plan", { status: 403 });
  const url = new URL(req.url);
  const period = currentPeriod(ctx, url.searchParams.get("start") ?? undefined);
  const filters = filtersFromParams(url.searchParams);
  // Consolidating every branch in one file is an Enterprise feature; others export per branch.
  if (!ctx.can("consolidatedReports") && !filters.locationId) {
    const branches = await ctx.db.location.count({ where: { archivedAt: null } });
    if (branches > 1)
      return new Response("Choose a branch, or upgrade to Enterprise for nationwide reports", {
        status: 403,
      });
  }
  const report = await buildAttendanceReport(ctx, period, filters);
  const format = url.searchParams.get("format") ?? "xlsx";
  await writeAudit(actorFrom(ctx), {
    action: "attendance.export",
    entityType: "AttendanceReport",
    after: { period, filters, format, employees: report.summary.length },
  });
  const base = `${ctx.company.slug}-attendance-${period.start}_${period.end}`;
  if (format === "csv") {
    const sheet = (REPORT_SHEETS as readonly string[]).includes(url.searchParams.get("sheet") ?? "")
      ? (url.searchParams.get("sheet") as ReportSheet)
      : "daily";
    return csvResponse(`${base}-${sheet}.csv`, attendanceCsvRows(report, sheet));
  }
  const buf = await attendanceWorkbook(report, ctx.user.name || ctx.user.email);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

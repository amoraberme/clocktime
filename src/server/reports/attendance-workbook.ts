import "server-only";
import ExcelJS from "exceljs";
import { formatKey } from "@/lib/time";
import type { AttendanceReport } from "../services/attendance-report";

export const REPORT_SHEETS = ["summary", "daily", "review", "leave-ot", "branches"] as const;
export type ReportSheet = (typeof REPORT_SHEETS)[number];

/** Minutes as decimal hours, which payroll systems import directly. */
const h = (m: number) => Math.round((m / 60) * 100) / 100;

type Row = (string | number)[];
type Table = { title: string; header: string[]; rows: Row[]; totals?: Row };

/** The report's sheets as plain tables, shared by the Excel and CSV exports. */
export function reportTables(r: AttendanceReport): Record<ReportSheet, Table> {
  const sum = (rows: Row[], from: number) =>
    rows.length === 0
      ? undefined
      : rows[0]!.map((_, i) =>
          i === 0
            ? "Total"
            : i < from
              ? ""
              : Math.round(rows.reduce((t, x) => t + (Number(x[i]) || 0), 0) * 100) / 100,
        );
  const summaryRows: Row[] = r.summary.map((s) => [
    s.employeeNo,
    s.name,
    s.department,
    s.branch,
    s.region,
    s.daysPresent,
    s.absences,
    s.paidLeaveDays,
    s.unpaidLeaveDays,
    h(s.workedMinutes),
    h(s.regularMinutes),
    h(s.nightMinutes),
    h(s.overtimeMinutes),
    h(s.approvedOvertimeMinutes),
    h(s.pendingOvertimeMinutes),
    s.lateCount,
    s.lateMinutes,
    s.undertimeMinutes,
    s.missingPunches,
    s.reviewItems,
  ]);
  const dailyRows: Row[] = r.daily.map((d) => [
    d.employeeNo,
    d.name,
    d.department,
    d.branch,
    d.date,
    d.weekday,
    d.dayType,
    d.schedule,
    d.timeIn,
    d.timeOut,
    d.methods,
    h(d.workedMinutes),
    h(d.regularMinutes),
    h(d.nightMinutes),
    d.lateMinutes,
    d.undertimeMinutes,
    h(d.overtimeMinutes),
    h(d.approvedOvertimeMinutes),
    h(d.pendingOvertimeMinutes),
    d.leave,
    d.absent ? "Yes" : "",
    d.remarks.join("; "),
  ]);
  const review = r.daily.filter((d) => d.needsReview);
  const leaveOt = r.daily.filter((d) => d.leave || d.overtimeMinutes > 0);
  const branchRows: Row[] = r.branches.map((b) => [
    b.region || "—",
    b.branch || "—",
    b.branchCode,
    b.headcount,
    b.daysPresent,
    b.absences,
    b.leaveDays,
    b.lateCount,
    h(b.workedMinutes),
    h(b.approvedOvertimeMinutes),
    h(b.pendingOvertimeMinutes),
    b.reviewItems,
  ]);
  return {
    summary: {
      title: "Summary",
      header: [
        "Employee No",
        "Name",
        "Department",
        "Branch",
        "Region",
        "Days Present",
        "Absences",
        "Paid Leave (days)",
        "Unpaid Leave (days)",
        "Worked (h)",
        "Regular (h)",
        "Night Diff (h)",
        "OT Rendered (h)",
        "OT Approved (h)",
        "OT For Review (h)",
        "Times Late",
        "Late (min)",
        "Undertime (min)",
        "Missing Punches",
        "Days For Review",
      ],
      rows: summaryRows,
      totals: sum(summaryRows, 5),
    },
    daily: {
      title: "Daily DTR",
      header: [
        "Employee No",
        "Name",
        "Department",
        "Branch",
        "Date",
        "Day",
        "Day Type",
        "Schedule",
        "Time In",
        "Time Out",
        "Method",
        "Worked (h)",
        "Regular (h)",
        "Night Diff (h)",
        "Late (min)",
        "Undertime (min)",
        "OT Rendered (h)",
        "OT Approved (h)",
        "OT For Review (h)",
        "Leave",
        "Absent",
        "Remarks",
      ],
      rows: dailyRows,
    },
    review: {
      title: "For HR review",
      header: [
        "Employee No",
        "Name",
        "Branch",
        "Date",
        "Schedule",
        "Time In",
        "Time Out",
        "Worked (h)",
        "OT For Review (h)",
        "Issue",
      ],
      rows: review.map((d) => [
        d.employeeNo,
        d.name,
        d.branch,
        d.date,
        d.schedule,
        d.timeIn,
        d.timeOut,
        h(d.workedMinutes),
        h(d.pendingOvertimeMinutes),
        d.remarks.join("; "),
      ]),
    },
    "leave-ot": {
      title: "Leaves and OT",
      header: [
        "Employee No",
        "Name",
        "Branch",
        "Date",
        "Leave",
        "Leave Days",
        "Paid",
        "OT Rendered (h)",
        "OT Approved (h)",
        "OT For Review (h)",
      ],
      rows: leaveOt.map((d) => [
        d.employeeNo,
        d.name,
        d.branch,
        d.date,
        d.leave,
        d.leaveDays || "",
        d.leave ? (d.paidLeave ? "Yes" : "No") : "",
        h(d.overtimeMinutes),
        h(d.approvedOvertimeMinutes),
        h(d.pendingOvertimeMinutes),
      ]),
    },
    branches: {
      title: "Branch totals",
      header: [
        "Region",
        "Branch",
        "Branch Code",
        "Headcount",
        "Days Present",
        "Absences",
        "Leave Days",
        "Times Late",
        "Worked (h)",
        "OT Approved (h)",
        "OT For Review (h)",
        "Days For Review",
      ],
      rows: branchRows,
      totals: sum(branchRows, 3),
    },
  };
}

export function reportHeading(r: AttendanceReport) {
  const filters = Object.entries(r.filters)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  return {
    title: `${r.company} attendance report`,
    subtitle: `Cutoff ${formatKey(r.period.start)} – ${formatKey(r.period.end)}${filters ? ` · ${filters}` : " · all employees"}`,
  };
}

export async function attendanceWorkbook(r: AttendanceReport, generatedBy: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ClockTime";
  wb.created = r.generatedAt;
  const { title, subtitle } = reportHeading(r);
  const tables = reportTables(r);
  for (const key of REPORT_SHEETS) {
    const t = tables[key];
    const ws = wb.addWorksheet(t.title, { views: [{ state: "frozen", ySplit: 4 }] });
    ws.addRow([title]).font = { bold: true, size: 14 };
    ws.addRow([subtitle]).font = { color: { argb: "FF555555" } };
    ws.addRow([
      `Generated ${r.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC by ${generatedBy}`,
    ]).font = {
      color: { argb: "FF888888" },
      size: 9,
    };
    const head = ws.addRow(t.header);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
      c.alignment = { vertical: "middle", wrapText: true };
    });
    for (const row of t.rows) {
      const added = ws.addRow(row);
      if (key === "daily" && String(row[20]) === "Yes") added.font = { color: { argb: "FFB91C1C" } };
    }
    if (t.totals) ws.addRow(t.totals).font = { bold: true };
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: t.header.length } };
    t.header.forEach((label, i) => {
      const width = Math.max(label.length, ...t.rows.slice(0, 500).map((r) => String(r[i] ?? "").length));
      ws.getColumn(i + 1).width = Math.min(Math.max(width + 2, 8), 48);
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function attendanceCsvRows(r: AttendanceReport, sheet: ReportSheet) {
  const t = reportTables(r)[sheet];
  return [t.header, ...t.rows, ...(t.totals ? [t.totals] : [])];
}

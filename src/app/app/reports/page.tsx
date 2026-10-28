import { Download, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PeriodNav } from "@/components/timesheets/period-nav";
import { UpgradeCard } from "@/components/upgrade-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { Alert, EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatHoursDecimal } from "@/lib/time";
import { requireContext } from "@/server/context";
import { filtersFromParams } from "@/server/reports/report-params";
import { employeeScopeWhere } from "@/server/scope";
import { cachedAttendanceReport } from "@/server/services/attendance-report";
import { currentPeriod } from "@/server/services/timesheets";

export const metadata: Metadata = { title: "Reports" };

const hrs = (m: number) => formatHoursDecimal(m);

const PREVIEW_ROWS = 100;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireContext("MANAGER");
  if (!ctx.can("attendanceReports"))
    return (
      <>
        <PageHeader title="Reports" />
        <UpgradeCard
          feature="attendanceReports"
          title="Cutoff attendance reports"
          description="Excel/CSV per cutoff with time in/out, hours, approved OT, late, undertime, absences and leave."
        />
      </>
    );
  const sp = await searchParams;
  const period = currentPeriod(ctx, sp.start);
  const filters = filtersFromParams(sp);
  const [departments, locations, regions, employees] = await Promise.all([
    ctx.db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ctx.db.location.findMany({
      where: { archivedAt: null, ...(ctx.managedLocationIds ? { id: { in: ctx.managedLocationIds } } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    ctx.can("regions")
      ? ctx.db.region.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    ctx.db.employee.findMany({
      where: { status: { not: "ARCHIVED" }, ...employeeScopeWhere(ctx) },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNo: true },
    }),
  ]);
  const needsBranch = !ctx.can("consolidatedReports") && locations.length > 1 && !filters.locationId;
  const report = needsBranch ? null : await cachedAttendanceReport(ctx, period, filters);
  const qs = new URLSearchParams(
    Object.entries({ ...sp, start: period.start }).filter((e): e is [string, string] => !!e[1]),
  );
  const exportHref = (extra: Record<string, string>) =>
    `/api/export/attendance?${new URLSearchParams({ ...Object.fromEntries(qs), ...extra })}`;
  // The preview lists the people with the most to review; the downloads have everyone.
  const preview = report
    ? [...report.summary].sort((a, b) => b.reviewItems - a.reviewItems).slice(0, PREVIEW_ROWS)
    : [];
  const totals = report?.summary.reduce(
    (t, s) => ({
      worked: t.worked + s.workedMinutes,
      approvedOt: t.approvedOt + s.approvedOvertimeMinutes,
      pendingOt: t.pendingOt + s.pendingOvertimeMinutes,
      absences: t.absences + s.absences,
      late: t.late + s.lateCount,
      review: t.review + s.reviewItems,
    }),
    { worked: 0, approvedOt: 0, pendingOt: 0, absences: 0, late: 0, review: 0 },
  );
  const base = `/app/reports?${new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1] && e[0] !== "start"))}`;

  return (
    <>
      <PageHeader
        title="Cutoff attendance report"
        description="Time in/out, hours, approved overtime, late, undertime, absences and leave for the cutoff."
        actions={
          <PeriodNav
            base={base}
            start={period.start}
            end={period.end}
            isCurrent={period.start === currentPeriod(ctx).start}
          />
        }
      />
      <Card className="mb-6">
        <CardContent className="pt-6">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <input type="hidden" name="start" value={period.start} />
            {regions.length > 0 ? (
              <Field label="Region" htmlFor="r-region">
                <Select id="r-region" name="region" defaultValue={filters.regionId ?? ""}>
                  <option value="">All regions</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Branch" htmlFor="r-location">
              <Select id="r-location" name="location" defaultValue={filters.locationId ?? ""}>
                <option value="">
                  {ctx.can("consolidatedReports") ? "All branches" : "Choose a branch"}
                </option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code ? `${l.name} (${l.code})` : l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Department" htmlFor="r-dept">
              <Select id="r-dept" name="department" defaultValue={filters.departmentId ?? ""}>
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Employee" htmlFor="r-emp">
              <Select id="r-emp" name="employee" defaultValue={filters.employeeId ?? ""}>
                <option value="">Everyone</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.lastName}, {e.firstName}
                    {e.employeeNo ? ` · ${e.employeeNo}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="outline">
              Apply filters
            </Button>
          </form>
        </CardContent>
      </Card>

      {needsBranch ? (
        <Alert tone="info">
          Choose a branch to see its report. Nationwide reports that consolidate every branch in one file are
          part of the Enterprise plan.
        </Alert>
      ) : !report || report.summary.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="No one matches these filters" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="People" value={report.summary.length} />
            <Stat label="Worked" value={`${hrs(totals!.worked)} h`} />
            <Stat label="OT approved" value={`${hrs(totals!.approvedOt)} h`} />
            <Stat
              label="OT for review"
              value={`${hrs(totals!.pendingOt)} h`}
              hint="Not paid until approved"
            />
            <Stat label="Absences" value={totals!.absences} hint={`${totals!.late} late arrivals`} />
            <Stat label="Days to review" value={totals!.review} hint="Missing punches, long duty, OT" />
          </div>
          <div className="mb-6 flex flex-wrap gap-2">
            <Button asChild>
              <a href={exportHref({ format: "xlsx" })}>
                <Download /> Excel workbook
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={exportHref({ format: "csv", sheet: "summary" })}>Summary CSV</a>
            </Button>
            <Button asChild variant="outline">
              <a href={exportHref({ format: "csv", sheet: "daily" })}>Daily DTR CSV</a>
            </Button>
            <Button asChild variant="outline">
              <a href={exportHref({ format: "csv", sheet: "review" })}>For-review CSV</a>
            </Button>
          </div>

          {report.branches.length > 1 ? (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Branch totals</CardTitle>
              </CardHeader>
              <Table>
                <THead>
                  <tr>
                    <TH>Region</TH>
                    <TH>Branch</TH>
                    <TH className="text-right">People</TH>
                    <TH className="text-right">Days present</TH>
                    <TH className="text-right">Absences</TH>
                    <TH className="text-right">Late</TH>
                    <TH className="text-right">Worked (h)</TH>
                    <TH className="text-right">OT approved (h)</TH>
                    <TH className="text-right">To review</TH>
                  </tr>
                </THead>
                <TBody>
                  {report.branches.map((b) => (
                    <TR key={`${b.region}|${b.branch}`}>
                      <TD>{b.region || "—"}</TD>
                      <TD className="font-medium">{b.branch || "—"}</TD>
                      <TD className="tabular text-right">{b.headcount}</TD>
                      <TD className="tabular text-right">{b.daysPresent}</TD>
                      <TD className="tabular text-right">{b.absences}</TD>
                      <TD className="tabular text-right">{b.lateCount}</TD>
                      <TD className="tabular text-right">{hrs(b.workedMinutes)}</TD>
                      <TD className="tabular text-right">{hrs(b.approvedOvertimeMinutes)}</TD>
                      <TD className="tabular text-right">
                        {b.reviewItems ? <Badge tone="warning">{b.reviewItems}</Badge> : 0}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          ) : null}

          <Card>
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH className="hidden md:table-cell">Branch</TH>
                  <TH className="text-right">Present</TH>
                  <TH className="text-right">Absent</TH>
                  <TH className="text-right">Leave</TH>
                  <TH className="text-right">Worked (h)</TH>
                  <TH className="text-right">OT appr. / review (h)</TH>
                  <TH className="hidden text-right md:table-cell">Late / UT (min)</TH>
                  <TH className="text-right">Review</TH>
                </tr>
              </THead>
              <TBody>
                {preview.map((s) => (
                  <TR key={s.employeeId}>
                    <TD>
                      <Link
                        href={`/app/timesheets/${s.employeeId}?start=${period.start}`}
                        className="font-medium hover:underline"
                      >
                        {s.name}
                      </Link>
                      <span className="text-muted-foreground block text-xs">
                        {[s.employeeNo, s.department].filter(Boolean).join(" · ")}
                      </span>
                    </TD>
                    <TD className="hidden md:table-cell">{s.branch}</TD>
                    <TD className="tabular text-right">{s.daysPresent}</TD>
                    <TD className="tabular text-right">{s.absences || ""}</TD>
                    <TD className="tabular text-right">{s.paidLeaveDays + s.unpaidLeaveDays || ""}</TD>
                    <TD className="tabular text-right">{hrs(s.workedMinutes)}</TD>
                    <TD className="tabular text-right">
                      {hrs(s.approvedOvertimeMinutes)}
                      {s.pendingOvertimeMinutes ? (
                        <span className="text-warning"> / {hrs(s.pendingOvertimeMinutes)}</span>
                      ) : null}
                    </TD>
                    <TD className="tabular hidden text-right md:table-cell">
                      {s.lateMinutes} / {s.undertimeMinutes}
                    </TD>
                    <TD className="text-right">
                      {s.reviewItems ? <Badge tone="warning">{s.reviewItems}</Badge> : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {report.summary.length > preview.length ? (
              <p className="text-muted-foreground border-t px-4 py-3 text-sm">
                Showing the {preview.length} people with the most to review, of{" "}
                {report.summary.length.toLocaleString()}. Everyone is in the Excel workbook and CSV downloads.
              </p>
            ) : null}
          </Card>
        </>
      )}
    </>
  );
}

import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ApproveButton } from "@/components/timesheets/approve-controls";
import { PeriodNav } from "@/components/timesheets/period-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, PageHeader, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatPeso } from "@/lib/money";
import { formatMinutes } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import { currentPeriod, teamPeriodSummary } from "@/server/services/timesheets";

export const metadata: Metadata = { title: "Timesheets" };

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const ctx = await requireContext("MANAGER");
  const { start } = await searchParams;
  const period = currentPeriod(ctx, start);
  const isCurrent = currentPeriod(ctx).start === period.start;
  const rows = await teamPeriodSummary(ctx, period);
  const withHours = rows.filter((r) => r.entries.length > 0);
  const totals = withHours.reduce(
    (t, r) => ({
      worked: t.worked + r.hours.totals.workedMinutes,
      ot: t.ot + r.hours.totals.overtimeMinutes,
      gross: t.gross + r.gross.gross,
    }),
    { worked: 0, ot: 0, gross: 0 },
  );
  const pendingIds = withHours
    .filter((r) => r.timesheet?.status !== "APPROVED" && r.timesheet?.status !== "LOCKED")
    .map((r) => r.employee.id);
  const canApprove = ctx.can("approvals");

  return (
    <>
      <PageHeader
        title="Timesheets"
        description={`Pay period · payday ${period.payDate}`}
        actions={
          <>
            <PeriodNav base="/app/timesheets" start={period.start} end={period.end} isCurrent={isCurrent} />
            <Button asChild variant="outline">
              <a href={`/api/export/timesheets?start=${period.start}&format=summary`}>
                <Download /> Export CSV
              </a>
            </Button>
            {canApprove ? (
              <ApproveButton
                employeeIds={pendingIds}
                period={period}
                label={`Approve all (${pendingIds.length})`}
              />
            ) : null}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Hours worked" value={formatMinutes(totals.worked)} />
        <Stat label="Overtime" value={formatMinutes(totals.ot)} />
        {ctx.canViewPay ? (
          <Stat
            label="Gross pay estimate"
            value={formatPeso(totals.gross)}
            hint="Premiums included, before deductions"
          />
        ) : (
          <Stat label="People" value={rows.length} />
        )}
        <Stat label="Approved" value={`${withHours.length - pendingIds.length} / ${withHours.length}`} />
      </div>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              <TH className="text-right">Worked</TH>
              <TH className="text-right">Regular</TH>
              <TH className="text-right">Overtime</TH>
              <TH className="hidden text-right md:table-cell">Night diff</TH>
              <TH className="hidden text-right md:table-cell">Late</TH>
              {ctx.canViewPay ? <TH className="text-right">Gross est.</TH> : null}
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ employee: e, hours, gross, timesheet, openExceptions, entries }) => (
              <TR key={e.id}>
                <TD>
                  <Link
                    href={`/app/timesheets/${e.id}?start=${period.start}`}
                    className="flex items-center gap-3 font-medium hover:underline"
                  >
                    <Avatar firstName={e.firstName} lastName={e.lastName} color={e.color} size="sm" />
                    {fullName(e)}
                  </Link>
                </TD>
                <TD className="tabular text-right">{formatMinutes(hours.totals.workedMinutes)}</TD>
                <TD className="tabular text-right">{formatMinutes(hours.totals.regularMinutes)}</TD>
                <TD className="tabular text-right">
                  {formatMinutes(hours.totals.overtimeMinutes)}
                  {gross.unapprovedOvertimeMinutes > 0 ? (
                    <span className="text-warning block text-[11px]">
                      {formatMinutes(gross.unapprovedOvertimeMinutes)} unapproved
                    </span>
                  ) : null}
                </TD>
                <TD className="tabular hidden text-right md:table-cell">
                  {formatMinutes(hours.totals.nightMinutes)}
                </TD>
                <TD className="tabular hidden text-right md:table-cell">
                  {formatMinutes(hours.totals.lateMinutes)}
                </TD>
                {ctx.canViewPay ? (
                  <TD className="tabular text-right font-medium">{formatPeso(gross.gross)}</TD>
                ) : null}
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {entries.length === 0 ? (
                      <Badge>No hours</Badge>
                    ) : timesheet?.status === "LOCKED" ? (
                      <Badge tone="info">Paid</Badge>
                    ) : timesheet?.status === "APPROVED" ? (
                      <Badge tone="success">Approved</Badge>
                    ) : (
                      <Badge tone="warning">Pending</Badge>
                    )}
                    {hours.openEntryIds.length ? <Badge tone="success">On the clock</Badge> : null}
                    {openExceptions ? (
                      <Badge tone="danger">
                        {openExceptions} issue{openExceptions > 1 ? "s" : ""}
                      </Badge>
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

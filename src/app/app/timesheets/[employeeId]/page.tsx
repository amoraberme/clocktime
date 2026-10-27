import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApproveButton } from "@/components/timesheets/approve-controls";
import { EntryDialog } from "@/components/timesheets/entry-dialog";
import { EntryFlags } from "@/components/timesheets/entry-flags";
import { PeriodNav } from "@/components/timesheets/period-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Avatar, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatPeso } from "@/lib/money";
import { dayTypeFor } from "@/lib/pay/hours";
import { DAY_TYPE_LABELS } from "@/lib/pay/premiums";
import { dateKey, eachDay, formatKey, formatMinutes, formatTime, toLocalDateTimeInput } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import { employeeScopeWhere } from "@/server/scope";
import {
  computeEmployeePeriod,
  currentPeriod,
  loadEntries,
  loadPayInputs,
  todayKey,
} from "@/server/services/timesheets";

export default async function EmployeeTimesheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const ctx = await requireContext("MANAGER");
  const { employeeId } = await params;
  const { start } = await searchParams;
  const emp = await ctx.db.employee.findFirst({ where: { id: employeeId, ...employeeScopeWhere(ctx) } });
  if (!emp) notFound();
  const tz = ctx.company.timezone;
  const period = currentPeriod(ctx, start);
  const [entries, inputs, timesheet, locations] = await Promise.all([
    loadEntries(ctx.company.id, [emp.id], period.start, period.end, tz),
    loadPayInputs(ctx, [emp.id], period),
    ctx.db.timesheet.findFirst({
      where: { employeeId: emp.id, periodStart: new Date(`${period.start}T00:00:00Z`) },
    }),
    ctx.db.location.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
  ]);
  const today = todayKey(ctx);
  const result = computeEmployeePeriod(
    ctx,
    emp,
    entries,
    period,
    inputs,
    today < period.end ? today : undefined,
  );
  const dayMap = new Map(result.hours.days.map((d) => [d.date, d]));
  const status = timesheet?.status ?? "PENDING";
  const locked = status === "LOCKED";
  const base = `/app/timesheets/${emp.id}`;

  return (
    <div className="space-y-6">
      <Link
        href={`/app/timesheets?start=${period.start}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> All timesheets
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Avatar firstName={emp.firstName} lastName={emp.lastName} color={emp.color} size="lg" />
          <div>
            <h1 className="text-2xl font-semibold">{fullName(emp)}</h1>
            <p className="text-muted-foreground text-sm">
              Timesheet ·{" "}
              <Badge tone={status === "APPROVED" ? "success" : status === "LOCKED" ? "info" : "warning"}>
                {status === "LOCKED" ? "paid & locked" : status.toLowerCase()}
              </Badge>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodNav
            base={base}
            start={period.start}
            end={period.end}
            isCurrent={currentPeriod(ctx).start === period.start}
          />
          {!locked ? (
            <EntryDialog
              employeeId={emp.id}
              trigger="add"
              locations={locations}
              draft={{
                clockIn: `${today}T08:00`,
                clockOut: `${today}T17:00`,
                locationId: locations[0]?.id ?? "",
                notes: "",
                breaks: [],
              }}
            />
          ) : null}
          {ctx.can("approvals") && !locked ? (
            status === "APPROVED" ? (
              <ApproveButton
                employeeIds={[emp.id]}
                period={period}
                approve={false}
                label="Reopen"
                variant="outline"
              />
            ) : (
              <ApproveButton employeeIds={[emp.id]} period={period} label="Approve timesheet" />
            )
          ) : null}
        </div>
      </div>

      {result.hours.openEntryIds.length ? (
        <Alert tone="info">
          {fullName(emp)} is on the clock. Open entries aren&apos;t counted until they clock out.
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Worked"
          value={formatMinutes(result.hours.totals.workedMinutes)}
          hint={`${result.hours.totals.daysWorked} days`}
        />
        <Stat
          label="Overtime"
          value={formatMinutes(result.hours.totals.overtimeMinutes)}
          hint={
            result.gross.unapprovedOvertimeMinutes
              ? `${formatMinutes(result.gross.unapprovedOvertimeMinutes)} not approved`
              : undefined
          }
        />
        <Stat label="Night diff" value={formatMinutes(result.hours.totals.nightMinutes)} />
        <Stat label="Late" value={formatMinutes(result.hours.totals.lateMinutes)} />
        {ctx.canViewPay ? <Stat label="Gross estimate" value={formatPeso(result.gross.gross)} /> : null}
      </div>

      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Day</TH>
              <TH>Punches</TH>
              <TH className="text-right">Worked</TH>
              <TH className="text-right">Reg / OT</TH>
              <TH className="hidden text-right md:table-cell">Break</TH>
              <TH className="w-12" />
            </tr>
          </THead>
          <TBody>
            {eachDay(period.start, period.end).map((day) => {
              const dt = dayTypeFor(day, { holidays: inputs.holidays, restDays: emp.restDays });
              const summary = dayMap.get(day);
              const dayEntries = entries.filter((e) => dateKey(e.clockInAt, tz) === day);
              return (
                <TR key={day} className={day > today ? "opacity-50" : undefined}>
                  <TD className="whitespace-nowrap">
                    <span className="font-medium">{formatKey(day)}</span>
                    {dt !== "ORDINARY" ? (
                      <Badge tone={dt === "REST" ? "neutral" : "info"} className="ml-2">
                        {DAY_TYPE_LABELS[dt]}
                      </Badge>
                    ) : null}
                  </TD>
                  <TD>
                    {dayEntries.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="space-y-1">
                        {dayEntries.map((e) => (
                          <div key={e.id} className="flex flex-wrap items-center gap-2">
                            <span className="tabular">
                              {formatTime(e.clockInAt, tz)} –{" "}
                              {e.clockOutAt ? formatTime(e.clockOutAt, tz) : "…"}
                              {e.clockOutAt && dateKey(e.clockOutAt, tz) !== day ? (
                                <span className="text-muted-foreground text-xs">
                                  {" "}
                                  ({formatKey(dateKey(e.clockOutAt, tz))})
                                </span>
                              ) : null}
                            </span>
                            <EntryFlags
                              flags={e.flags}
                              inSource={e.inSource}
                              outSource={e.outSource}
                              manualOverride={e.manualOverride}
                            />
                            {e.inOutsideGeofence ? <Badge tone="warning">outside geofence</Badge> : null}
                            {e.shift ? (
                              <span className="text-muted-foreground text-xs">
                                sched {formatTime(e.shift.startAt, tz)}–{formatTime(e.shift.endAt, tz)}
                              </span>
                            ) : null}
                            {!locked ? (
                              <EntryDialog
                                employeeId={emp.id}
                                trigger="edit"
                                locations={locations}
                                draft={{
                                  id: e.id,
                                  clockIn: toLocalDateTimeInput(e.clockInAt, tz),
                                  clockOut: e.clockOutAt ? toLocalDateTimeInput(e.clockOutAt, tz) : "",
                                  locationId: e.locationId ?? "",
                                  notes: e.notes ?? "",
                                  breaks: e.breaks
                                    .filter((b) => b.endAt)
                                    .map((b) => ({
                                      start: toLocalDateTimeInput(b.startAt, tz),
                                      end: toLocalDateTimeInput(b.endAt!, tz),
                                    })),
                                }}
                              />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </TD>
                  <TD className="tabular text-right">
                    {summary ? formatMinutes(summary.workedMinutes) : ""}
                  </TD>
                  <TD className="tabular text-muted-foreground text-right">
                    {summary
                      ? `${formatMinutes(summary.regularMinutes)} / ${formatMinutes(summary.overtimeMinutes)}`
                      : ""}
                  </TD>
                  <TD className="tabular text-muted-foreground hidden text-right md:table-cell">
                    {summary?.breakMinutes ? formatMinutes(summary.breakMinutes) : ""}
                  </TD>
                  <TD />
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      {ctx.canViewPay ? (
        <Card>
          <CardHeader>
            <CardTitle>Earnings estimate</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TBody>
                {result.gross.lines.map((l) => (
                  <TR key={l.code}>
                    <TD>{l.label}</TD>
                    <TD className="tabular text-muted-foreground text-right">
                      {l.minutes
                        ? formatMinutes(l.minutes)
                        : l.days
                          ? `${l.days} day${l.days === 1 ? "" : "s"}`
                          : ""}
                    </TD>
                    <TD className="tabular text-right">{formatPeso(l.amount)}</TD>
                  </TR>
                ))}
                <TR>
                  <TD className="font-semibold">Gross pay</TD>
                  <TD />
                  <TD className="tabular text-right font-semibold">{formatPeso(result.gross.gross)}</TD>
                </TR>
              </TBody>
            </Table>
            <p className="text-muted-foreground mt-3 text-xs">
              Daily rate {formatPeso(result.gross.dailyRate)} · hourly {formatPeso(result.gross.hourlyRate)}.
              Government deductions and tax are computed in Payroll.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

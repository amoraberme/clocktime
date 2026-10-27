import type { Metadata } from "next";
import { OvertimeRequestForm } from "@/components/me/overtime-request";
import { PeriodNav } from "@/components/timesheets/period-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/misc";
import { formatPeso } from "@/lib/money";
import { DAY_TYPE_LABELS } from "@/lib/pay/premiums";
import { dateKey, formatKey, formatMinutes, formatTime, keyToUtcDate, utcDateToKey } from "@/lib/time";
import { requireContext } from "@/server/context";
import {
  computeEmployeePeriod,
  currentPeriod,
  loadEntries,
  loadPayInputs,
  todayKey,
} from "@/server/services/timesheets";

export const metadata: Metadata = { title: "My hours" };

export default async function MyTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const ctx = await requireContext();
  const { start } = await searchParams;
  const tz = ctx.company.timezone;
  const period = currentPeriod(ctx, start);
  const today = todayKey(ctx);
  const [entries, inputs, timesheet, otRequests] = await Promise.all([
    loadEntries(ctx.company.id, [ctx.employee.id], period.start, period.end, tz),
    loadPayInputs(ctx, [ctx.employee.id], period),
    ctx.db.timesheet.findFirst({
      where: { employeeId: ctx.employee.id, periodStart: keyToUtcDate(period.start) },
    }),
    ctx.can("overtime")
      ? ctx.db.overtimeRequest.findMany({
          where: { employeeId: ctx.employee.id },
          orderBy: { date: "desc" },
          take: 10,
        })
      : [],
  ]);
  const r = computeEmployeePeriod(
    ctx,
    ctx.employee,
    entries,
    period,
    inputs,
    today < period.end ? today : undefined,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">My hours</h1>
        <PeriodNav
          base="/me/timesheet"
          start={period.start}
          end={period.end}
          isCurrent={currentPeriod(ctx).start === period.start}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Worked"
          value={formatMinutes(r.hours.totals.workedMinutes)}
          hint={`${r.hours.totals.daysWorked} days`}
        />
        <Stat
          label="Overtime"
          value={formatMinutes(r.hours.totals.overtimeMinutes)}
          hint={
            r.gross.unapprovedOvertimeMinutes
              ? `${formatMinutes(r.gross.unapprovedOvertimeMinutes)} awaiting approval`
              : undefined
          }
        />
        <Stat label="Night differential" value={formatMinutes(r.hours.totals.nightMinutes)} />
        <Stat
          label="Pay estimate"
          value={formatPeso(r.gross.gross)}
          hint={timesheet?.status === "APPROVED" ? "Approved" : "Before deductions"}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Days</CardTitle>
        </CardHeader>
        <CardContent>
          {r.hours.days.length === 0 && r.hours.openEntryIds.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hours yet this period.</p>
          ) : (
            <ul className="divide-y text-sm">
              {r.hours.days.map((d) => (
                <li key={d.date} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="font-medium">
                      {formatKey(d.date)}{" "}
                      {d.dayType !== "ORDINARY" ? (
                        <Badge tone="info">{DAY_TYPE_LABELS[d.dayType]}</Badge>
                      ) : null}
                    </p>
                    <p className="tabular text-muted-foreground text-xs">
                      {entries
                        .filter((e) => d.entryIds.includes(e.id))
                        .map(
                          (e) =>
                            `${formatTime(e.clockInAt, tz)}–${e.clockOutAt ? formatTime(e.clockOutAt, tz) : "…"}`,
                        )
                        .join(", ")}
                    </p>
                  </div>
                  <div className="tabular text-right">
                    <p>{formatMinutes(d.workedMinutes)}</p>
                    {d.overtimeMinutes ? (
                      <p className="text-warning text-xs">+{formatMinutes(d.overtimeMinutes)} OT</p>
                    ) : null}
                  </div>
                </li>
              ))}
              {entries
                .filter((e) => !e.clockOutAt)
                .map((e) => (
                  <li key={e.id} className="flex justify-between py-2">
                    <span>{formatKey(dateKey(e.clockInAt, tz))}</span>
                    <Badge tone="success">On the clock since {formatTime(e.clockInAt, tz)}</Badge>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pay estimate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {r.gross.lines.map((l) => (
            <div key={l.code} className="flex justify-between">
              <span>{l.label}</span>
              <span className="tabular">{formatPeso(l.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Gross</span>
            <span className="tabular">{formatPeso(r.gross.gross)}</span>
          </div>
          <p className="text-muted-foreground pt-2 text-xs">
            SSS, PhilHealth, Pag-IBIG and tax are deducted on payday. See Payslips.
          </p>
        </CardContent>
      </Card>
      {ctx.can("overtime") ? (
        <Card>
          <CardHeader>
            <CardTitle>Overtime requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <OvertimeRequestForm defaultDate={today} />
            <ul className="divide-y text-sm">
              {otRequests.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2">
                  <span>
                    {formatKey(utcDateToKey(o.date))} · {formatMinutes(o.minutes)}
                    <span className="text-muted-foreground block text-xs">{o.reason}</span>
                  </span>
                  <Badge
                    tone={
                      o.status === "APPROVED" ? "success" : o.status === "DECLINED" ? "danger" : "warning"
                    }
                  >
                    {o.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

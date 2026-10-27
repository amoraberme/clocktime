import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import { ClockPanel } from "@/components/clock/clock-panel";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { Card, CardContent } from "@/components/ui/card";
import { Stat } from "@/components/ui/misc";
import { formatPeso } from "@/lib/money";
import { dateKey, formatKey, formatMinutes, formatTime } from "@/lib/time";
import { requireContext } from "@/server/context";
import { actorOf } from "@/server/punch-http";
import { getClockState } from "@/server/services/timeclock";
import {
  computeEmployeePeriod,
  currentPeriod,
  loadEntries,
  loadPayInputs,
  todayKey,
} from "@/server/services/timesheets";

export const metadata: Metadata = { title: "Clock" };

export default async function ClockPage() {
  const ctx = await requireContext();
  const tz = ctx.company.timezone;
  const period = currentPeriod(ctx);
  const [state, entries, inputs] = await Promise.all([
    getClockState(actorOf(ctx)),
    loadEntries(ctx.company.id, [ctx.employee.id], period.start, period.end, tz),
    loadPayInputs(ctx, [ctx.employee.id], period),
  ]);
  const summary = computeEmployeePeriod(ctx, ctx.employee, entries, period, inputs, todayKey(ctx));

  return (
    <div className="space-y-4">
      <InstallPrompt />
      <ClockPanel
        initial={state}
        timezone={tz}
        scope={`emp:${ctx.employee.id}`}
        firstName={ctx.employee.firstName}
      />
      {state.nextShift ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <CalendarClock className="text-primary size-5" />
            <div className="text-sm">
              <p className="font-medium">
                {new Date(state.nextShift.startAt) <= new Date() ? "Current shift" : "Next shift"}:{" "}
                {formatKey(dateKey(new Date(state.nextShift.startAt), tz))}
              </p>
              <p className="text-muted-foreground">
                {formatTime(new Date(state.nextShift.startAt), tz)} –{" "}
                {formatTime(new Date(state.nextShift.endAt), tz)} · {state.nextShift.locationName}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Today" value={formatMinutes(state.todayMinutes)} />
        <Stat
          label="This pay period"
          value={formatMinutes(summary.hours.totals.workedMinutes)}
          hint={`${formatKey(period.start, { month: "short", day: "numeric" })} – ${formatKey(period.end, { month: "short", day: "numeric" })}`}
        />
        <Stat label="Overtime" value={formatMinutes(summary.hours.totals.overtimeMinutes)} />
        <Stat label="Pay estimate" value={formatPeso(summary.gross.gross)} hint="Before deductions" />
      </div>
    </div>
  );
}

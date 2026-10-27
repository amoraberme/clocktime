import { AlarmClock, Clock, Coffee, Inbox, TriangleAlert, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Avatar, EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { formatPeso } from "@/lib/money";
import { elapsedMinutes } from "@/lib/pay/hours";
import { formatKey, formatMinutes, formatTime, localParts } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import { dashboardData } from "@/server/queries/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

const TIMELINE_START_H = 5;
const TIMELINE_HOURS = 19;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const ctx = await requireContext("MANAGER");
  const { welcome } = await searchParams;
  const d = await dashboardData(ctx);
  const tz = ctx.company.timezone;
  const now = new Date();
  const hour = localParts(now, tz).hour;
  const span = TIMELINE_HOURS * 3600_000;
  const t0 = d.dayStart.getTime() + TIMELINE_START_H * 3600_000;
  const pct = (t: Date) => Math.min(100, Math.max(0, ((t.getTime() - t0) / span) * 100));

  const inboxItems = [
    { count: d.inbox.openExceptions, label: "exceptions to review", href: "/app/exceptions" },
    { count: d.inbox.staleOpen, label: "possible missed clock-outs", href: "/app/timesheets" },
    { count: d.inbox.pendingLeave, label: "time-off requests", href: "/app/leave" },
    { count: d.inbox.pendingSwaps, label: "shift swap requests", href: "/app/schedule?tab=requests" },
    { count: d.inbox.pendingOt, label: "overtime requests", href: "/app/exceptions?tab=overtime" },
    { count: d.lateOrMissing.length, label: "scheduled but not clocked in", href: "#late" },
  ].filter((i) => i.count > 0);

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title={`Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${ctx.employee.firstName}`}
        description={`${formatKey(d.today, { weekday: "long", month: "long", day: "numeric" })} · live view, refreshes every 30 seconds`}
        actions={
          <Button asChild variant="outline">
            <Link href="/app/schedule">Open schedule</Link>
          </Button>
        }
      />
      {welcome ? (
        <Alert tone="success" title="Your company is ready" className="mb-6">
          Next:{" "}
          <Link href="/app/team" className="underline">
            add your team
          </Link>
          , then{" "}
          <Link href="/app/schedule" className="underline">
            build this week&apos;s schedule
          </Link>
          . Staff can join with code <span className="font-mono font-semibold">{ctx.company.joinCode}</span>{" "}
          at /join.
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Clocked in now"
          value={`${d.onClock.length}`}
          hint={`of ${d.activeCount} active`}
          icon={Users}
        />
        <Stat label="On break" value={d.onBreakCount} icon={Coffee} />
        <Stat label="Hours today" value={formatMinutes(d.minutesToday)} icon={Clock} />
        {ctx.canViewPay ? (
          <Stat
            label="Labor cost today"
            value={formatPeso(d.laborCost)}
            hint="Base rate, before premiums"
            icon={Wallet}
          />
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Who&apos;s working</CardTitle>
            <Badge tone="success">{d.onClock.length} on the clock</Badge>
          </CardHeader>
          <CardContent>
            {d.onClock.length === 0 ? (
              <EmptyState
                icon={AlarmClock}
                title="Nobody is clocked in"
                description="Punches from phones and kiosks show up here live."
              />
            ) : (
              <ul className="divide-y">
                {d.onClock.map(({ entry, employee }) => {
                  const onBreak = entry.breaks.some((b) => !b.endAt);
                  return (
                    <li key={entry.id} className="flex items-center gap-3 py-2.5">
                      <Avatar
                        firstName={employee.firstName}
                        lastName={employee.lastName}
                        color={employee.color}
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/app/team/${employee.id}`}
                          className="truncate font-medium hover:underline"
                        >
                          {fullName(employee)}
                        </Link>
                        <p className="text-muted-foreground truncate text-xs">
                          {entry.location?.name ?? "No location"} · since {formatTime(entry.clockInAt, tz)} ·{" "}
                          {entry.inSource.toLowerCase()}
                        </p>
                      </div>
                      {entry.inOutsideGeofence ? <Badge tone="warning">Outside geofence</Badge> : null}
                      {onBreak ? <Badge tone="warning">On break</Badge> : null}
                      <span className="tabular text-sm font-medium">
                        {formatMinutes(elapsedMinutes(entry))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="size-4" /> Needs attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            {inboxItems.length === 0 ? (
              <p className="text-muted-foreground text-sm">All caught up. 🎉</p>
            ) : (
              <ul className="space-y-2">
                {inboxItems.map((i) => (
                  <li key={i.label}>
                    <Link
                      href={i.href}
                      className="hover:bg-muted flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-semibold">{i.count}</span> {i.label}
                      </span>
                      <span className="text-muted-foreground">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {d.openShifts > 0 ? (
              <p className="text-muted-foreground mt-3 text-xs">
                {d.openShifts} open shift(s) today still need someone.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Today&apos;s timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {d.timeline.length === 0 ? (
            <p className="text-muted-foreground text-sm">No shifts or punches today.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="flex gap-2">
                  <div className="w-38 shrink-0" />
                  <div className="text-muted-foreground relative h-4 flex-1 text-[10px]">
                    {Array.from({ length: TIMELINE_HOURS }, (_, i) => (
                      <span
                        key={i}
                        className="absolute -translate-x-1/2"
                        style={{ left: `${(i / TIMELINE_HOURS) * 100}%` }}
                      >
                        {(TIMELINE_START_H + i) % 24}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-1 space-y-2">
                  {d.timeline.map(({ employee, shifts, entries }) => (
                    <div key={employee.id} className="flex items-center gap-2">
                      <div className="w-38 shrink-0 truncate text-sm">{fullName(employee)}</div>
                      <div className="bg-muted relative h-7 flex-1 rounded">
                        {shifts.map((s) => (
                          <div
                            key={s.id}
                            title={`Scheduled ${formatTime(s.startAt, tz)}–${formatTime(s.endAt, tz)}`}
                            className="border-primary/50 absolute inset-y-0 rounded border-2 border-dashed"
                            style={{ left: `${pct(s.startAt)}%`, width: `${pct(s.endAt) - pct(s.startAt)}%` }}
                          />
                        ))}
                        {entries.map((e) => (
                          <div
                            key={e.id}
                            className="bg-primary/80 absolute inset-y-1 rounded"
                            style={{
                              left: `${pct(e.clockInAt)}%`,
                              width: `${Math.max(0.5, pct(e.clockOutAt ?? now) - pct(e.clockInAt))}%`,
                            }}
                          >
                            {e.breaks.map((b) => (
                              <div
                                key={b.id}
                                className="absolute inset-y-0 bg-amber-400"
                                style={{
                                  left: `${((pct(b.startAt) - pct(e.clockInAt)) / Math.max(0.01, pct(e.clockOutAt ?? now) - pct(e.clockInAt))) * 100}%`,
                                  width: `${((pct(b.endAt ?? now) - pct(b.startAt)) / Math.max(0.01, pct(e.clockOutAt ?? now) - pct(e.clockInAt))) * 100}%`,
                                }}
                              />
                            ))}
                          </div>
                        ))}
                        <div className="bg-danger absolute inset-y-0 w-px" style={{ left: `${pct(now)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground mt-3 text-xs">
                  Dashed = scheduled · solid = worked · amber = break · red line = now
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {d.lateOrMissing.length > 0 ? (
        <Card className="mt-6" id="late">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="text-warning size-4" /> Scheduled but not clocked in
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {d.lateOrMissing.map(({ shift, employee }) => (
                <li key={shift.id} className="flex items-center justify-between py-2">
                  <span>{fullName(employee)}</span>
                  <span className="text-muted-foreground">
                    {formatTime(shift.startAt, tz)} – {formatTime(shift.endAt, tz)} · {shift.location.name}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

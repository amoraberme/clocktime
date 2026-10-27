import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ScheduleImportDialog } from "@/components/schedule/import-dialog";
import { ScheduleToolbar } from "@/components/schedule/toolbar";
import { WeekGrid, type GridShift } from "@/components/schedule/week-grid";
import { SwapRequests } from "@/components/schedule/swap-requests";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { dailyRate } from "@/lib/pay/gross";
import {
  addDays,
  dateKey,
  eachDay,
  formatKey,
  minuteOfDay,
  toHHMM,
  utcDateToKey,
  formatTime,
} from "@/lib/time";
import { requireContext } from "@/server/context";
import { weekData } from "@/server/services/schedule";
import { loadHolidays } from "@/server/services/timesheets";
import { pendingRequests } from "@/server/services/swaps";
import { startOfWeek } from "@/lib/time";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; location?: string }>;
}) {
  const ctx = await requireContext("MANAGER");
  const sp = await searchParams;
  const tz = ctx.company.timezone;
  const weekStart = startOfWeek(sp.week ?? dateKey(new Date(), tz), ctx.settings.weekStartsOn);
  const locations = await ctx.db.location.findMany({
    where: { archivedAt: null, ...(ctx.managedLocationIds ? { id: { in: ctx.managedLocationIds } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  const locationId =
    locations.find((l) => l.id === sp.location)?.id ?? (locations.length === 1 ? locations[0]!.id : null);
  const [data, positions, holidays, requests] = await Promise.all([
    weekData(ctx, weekStart, locationId),
    ctx.db.position.findMany({ orderBy: { name: "asc" } }),
    loadHolidays(ctx.company.id, weekStart, addDays(weekStart, 6)),
    pendingRequests(ctx),
  ]);
  const holidayNames = await ctx.db.holiday
    .findMany({
      where: {
        OR: [{ companyId: null }, { companyId: ctx.company.id }],
        date: {
          gte: new Date(`${weekStart}T00:00:00Z`),
          lte: new Date(`${addDays(weekStart, 6)}T00:00:00Z`),
        },
      },
    })
    .then(
      (rows) =>
        new Map(rows.filter((h) => h.type !== "SPECIAL_WORKING").map((h) => [utcDateToKey(h.date), h.name])),
    );

  const shifts: GridShift[] = data.shifts.map((s) => ({
    id: s.id,
    employeeId: s.employeeId,
    date: dateKey(s.startAt, tz),
    start: toHHMM(minuteOfDay(s.startAt, tz)),
    end: toHHMM(minuteOfDay(s.endAt, tz)),
    label: `${formatTime(s.startAt, tz).replace(":00", "")}–${formatTime(s.endAt, tz).replace(":00", "")}`,
    paidMinutes: Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60000) - s.breakMinutes,
    breakMinutes: s.breakMinutes,
    positionId: s.positionId,
    positionName: s.position?.name ?? null,
    color: s.position?.color ?? "#64748b",
    locationId: s.locationId,
    locationName: s.location.name,
    notes: s.notes,
    status: s.status,
    confirmed: !!s.confirmedAt,
    recurring: !!s.recurrenceId,
    warnings: (data.warnings.get(s.id) ?? []).map((w) => w.message),
    pendingClaims: s.claims.length,
    pendingSwap: s.swapRequests.length > 0,
  }));
  const leave = data.leave.flatMap((l) =>
    eachDay(utcDateToKey(l.startDate), utcDateToKey(l.endDate)).map((d) => ({
      employeeId: l.employeeId,
      date: d,
      label: l.leaveType.name,
    })),
  );
  const drafts = shifts.filter((s) => s.status === "DRAFT").length;
  const q = (w: string) => `/app/schedule?week=${w}${locationId ? `&location=${locationId}` : ""}`;

  return (
    <>
      <PageHeader
        title="Schedule"
        description={`Week of ${formatKey(weekStart, { month: "long", day: "numeric", year: "numeric" })}. Drag shifts to move them. Drafts are only visible to you until published.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ScheduleImportDialog />
            <ScheduleToolbar
              weekStart={weekStart}
              prevWeek={addDays(weekStart, -7)}
              locationId={locationId}
              drafts={drafts}
              canAuto={ctx.can("autoSchedule")}
            />
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon" aria-label="Previous week">
          <Link href={q(addDays(weekStart, -7))}>
            <ChevronLeft />
          </Link>
        </Button>
        <Button asChild variant="outline" size="icon" aria-label="Next week">
          <Link href={q(addDays(weekStart, 7))}>
            <ChevronRight />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/app/schedule${locationId ? `?location=${locationId}` : ""}`}>This week</Link>
        </Button>
        {locations.length > 1 ? (
          <div className="bg-muted ml-auto flex flex-wrap gap-1 rounded-lg p-1 text-sm">
            <Link
              href={`/app/schedule?week=${weekStart}`}
              className={`rounded-md px-3 py-1 ${!locationId ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              All locations
            </Link>
            {locations.map((l) => (
              <Link
                key={l.id}
                href={`/app/schedule?week=${weekStart}&location=${l.id}`}
                className={`rounded-md px-3 py-1 ${locationId === l.id ? "bg-card shadow-sm" : "text-muted-foreground"}`}
              >
                {l.name}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      {requests.length > 0 ? <SwapRequests requests={requests} timezone={tz} /> : null}
      <WeekGrid
        days={data.days.map((d) => ({
          key: d,
          label: formatKey(d, { weekday: "short" }),
          sub: formatKey(d, { month: "short", day: "numeric" }),
          holiday: holidayNames.get(d) ?? (holidays.get(d)?.length ? "Holiday" : null),
        }))}
        employees={data.employees.map((e) => ({
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          color: e.color,
          positionName: e.position?.name ?? null,
          hourlyCost:
            dailyRate(
              { payType: e.payType, rateCentavos: e.rateCentavos, workDaysPerYear: e.workDaysPerYear },
              ctx.settings.dailyRegularMinutes,
            ) /
            (ctx.settings.dailyRegularMinutes / 60),
        }))}
        shifts={shifts}
        leave={leave}
        locations={locations}
        positions={positions.map((p) => ({ id: p.id, name: p.name }))}
        defaultLocationId={locationId ?? locations[0]?.id ?? ""}
        canOpenShifts={ctx.can("openShifts")}
        canRecurring={ctx.can("recurringShifts")}
      />
    </>
  );
}

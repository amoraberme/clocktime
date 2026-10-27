import type { Metadata } from "next";
import { MyRequestList } from "@/components/requests/my-requests";
import { CorrectionForm } from "@/components/requests/correction-form";
import { ScheduleChangeForm } from "@/components/requests/schedule-change-form";
import { UpgradeCard } from "@/components/upgrade-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dateKey, formatDateTime, formatKey, formatTime, toHHMM, minuteOfDay } from "@/lib/time";
import { requireContext } from "@/server/context";
import { myRequests } from "@/server/queries/approvals";

export const metadata: Metadata = { title: "Requests" };

export default async function MyRequestsPage() {
  const ctx = await requireContext();
  if (!ctx.can("approvals"))
    return (
      <UpgradeCard
        feature="approvals"
        title="Requests"
        description="File attendance corrections and schedule changes for approval."
      />
    );
  const tz = ctx.company.timezone;
  const now = new Date();
  const [entries, shifts, locations, requests] = await Promise.all([
    ctx.db.timeEntry.findMany({
      where: { employeeId: ctx.employee.id, clockInAt: { gte: new Date(now.getTime() - 21 * 86_400_000) } },
      orderBy: { clockInAt: "desc" },
      take: 40,
    }),
    ctx.db.shift.findMany({
      where: {
        employeeId: ctx.employee.id,
        status: "PUBLISHED",
        startAt: {
          gte: new Date(now.getTime() - 7 * 86_400_000),
          lte: new Date(now.getTime() + 35 * 86_400_000),
        },
      },
      orderBy: { startAt: "asc" },
      include: { location: { select: { name: true } } },
    }),
    ctx.db.location.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    myRequests(ctx),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Requests</h1>
      <Card>
        <CardHeader>
          <CardTitle>Fix my attendance</CardTitle>
          <CardDescription>
            Forgot to punch, or a time is wrong? Once approved, your timesheet and payroll are updated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CorrectionForm
            entries={entries.map((e) => ({
              id: e.id,
              label: `${formatKey(dateKey(e.clockInAt, tz))} · ${formatTime(e.clockInAt, tz)} – ${
                e.clockOutAt ? formatDateTime(e.clockOutAt, tz) : "no clock-out"
              }`,
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change my schedule</CardTitle>
          <CardDescription>Move a shift, add a duty or ask for a day off.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScheduleChangeForm
            today={dateKey(now, tz)}
            locations={locations}
            shifts={shifts.map((s) => ({
              id: s.id,
              label: `${formatKey(dateKey(s.startAt, tz))} · ${formatTime(s.startAt, tz)}–${formatTime(s.endAt, tz)} · ${s.location.name}`,
              date: dateKey(s.startAt, tz),
              start: toHHMM(minuteOfDay(s.startAt, tz)),
              end: toHHMM(minuteOfDay(s.endAt, tz)),
              locationId: s.locationId,
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>My requests</CardTitle>
        </CardHeader>
        <CardContent>
          <MyRequestList requests={requests} />
        </CardContent>
      </Card>
    </div>
  );
}

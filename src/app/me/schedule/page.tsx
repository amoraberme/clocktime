import { CalendarX2 } from "lucide-react";
import type { Metadata } from "next";
import { AvailabilityEditor } from "@/components/me/availability-editor";
import {
  CancelSwapButton,
  ClaimShiftButton,
  ConfirmShiftButton,
  IncomingSwapButtons,
  SwapDialog,
} from "@/components/me/schedule-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import {
  addDays,
  dateKey,
  formatKey,
  formatTime,
  minuteToLabel,
  startOfDay,
  toHHMM,
  utcDateToKey,
} from "@/lib/time";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "My schedule" };

export default async function MySchedulePage() {
  const ctx = await requireContext();
  const tz = ctx.company.timezone;
  const now = new Date();
  const horizon = startOfDay(addDays(dateKey(now, tz), 21), tz);
  const myLocations = (
    await prisma.employeeLocation.findMany({ where: { employeeId: ctx.employee.id } })
  ).map((l) => l.locationId);

  const [shifts, openShifts, incoming, colleagues, availability] = await Promise.all([
    ctx.db.shift.findMany({
      where: {
        employeeId: ctx.employee.id,
        status: "PUBLISHED",
        endAt: { gte: now },
        startAt: { lt: horizon },
      },
      include: {
        location: { select: { name: true } },
        position: { select: { name: true, color: true } },
        swapRequests: {
          where: { status: { in: ["PENDING_PEER", "PENDING_MANAGER"] } },
          include: { targetEmployee: true },
        },
      },
      orderBy: { startAt: "asc" },
    }),
    ctx.can("openShifts")
      ? ctx.db.shift.findMany({
          where: {
            employeeId: null,
            status: "PUBLISHED",
            startAt: { gte: now, lt: horizon },
            ...(myLocations.length ? { locationId: { in: myLocations } } : {}),
          },
          include: {
            location: { select: { name: true } },
            position: { select: { name: true } },
            claims: { where: { employeeId: ctx.employee.id } },
          },
          orderBy: { startAt: "asc" },
        })
      : [],
    ctx.db.shiftSwapRequest.findMany({
      where: { targetEmployeeId: ctx.employee.id, status: "PENDING_PEER" },
      include: { requester: true, shift: true, targetShift: true },
    }),
    ctx.can("shiftSwaps")
      ? ctx.db.employee.findMany({
          where: {
            status: "ACTIVE",
            id: { not: ctx.employee.id },
            ...(myLocations.length ? { locations: { some: { locationId: { in: myLocations } } } } : {}),
          },
          include: {
            shifts: {
              where: { status: "PUBLISHED", startAt: { gte: now, lt: horizon } },
              orderBy: { startAt: "asc" },
            },
          },
          orderBy: { firstName: "asc" },
        })
      : [],
    ctx.can("availability") ? ctx.db.availability.findMany({ where: { employeeId: ctx.employee.id } }) : [],
  ]);

  const shiftLabel = (s: { startAt: Date; endAt: Date }) =>
    `${formatKey(dateKey(s.startAt, tz))}, ${formatTime(s.startAt, tz)} – ${formatTime(s.endAt, tz)}`;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">My schedule</h1>

      {incoming.length > 0 ? (
        <Card className="border-info/40">
          <CardHeader>
            <CardTitle>Swap requests for you</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {incoming.map((r) => (
              <div key={r.id} className="space-y-2 rounded-md border p-3 text-sm">
                <p>
                  <b>{fullName(r.requester)}</b> {r.targetShift ? "wants to trade" : "wants to give you"}{" "}
                  {shiftLabel(r.shift)}
                  {r.targetShift ? ` for your shift on ${shiftLabel(r.targetShift)}` : ""}.
                </p>
                {r.note ? <p className="text-muted-foreground">“{r.note}”</p> : null}
                <IncomingSwapButtons id={r.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Upcoming shifts</CardTitle>
          <CardDescription>
            Next 3 weeks. Confirm each shift so your manager knows you&apos;ve seen it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (
            <EmptyState
              icon={CalendarX2}
              title="No shifts scheduled"
              description="When your manager publishes the schedule, your shifts appear here."
            />
          ) : (
            <ul className="space-y-3">
              {shifts.map((s) => {
                const pending = s.swapRequests[0];
                return (
                  <li
                    key={s.id}
                    className="rounded-lg border p-3"
                    style={{ borderLeft: `4px solid ${s.position?.color ?? "#0f766e"}` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {formatKey(dateKey(s.startAt, tz), {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                        <p className="tabular text-sm">
                          {formatTime(s.startAt, tz)} – {formatTime(s.endAt, tz)}
                          <span className="text-muted-foreground">
                            {" "}
                            · {s.location.name}
                            {s.position ? ` · ${s.position.name}` : ""}
                          </span>
                        </p>
                        {s.notes ? <p className="text-muted-foreground mt-1 text-xs">{s.notes}</p> : null}
                      </div>
                      {s.confirmedAt ? <Badge tone="success">Confirmed</Badge> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {!s.confirmedAt ? <ConfirmShiftButton id={s.id} /> : null}
                      {pending ? (
                        <>
                          <Badge tone="info">
                            {pending.status === "PENDING_PEER"
                              ? `Waiting for ${pending.targetEmployee?.firstName}`
                              : "Waiting for manager"}
                          </Badge>
                          <CancelSwapButton id={pending.id} />
                        </>
                      ) : ctx.can("shiftSwaps") && s.startAt > now ? (
                        <SwapDialog
                          shiftId={s.id}
                          colleagues={colleagues.map((c) => ({
                            id: c.id,
                            name: fullName(c),
                            shifts: c.shifts.map((cs) => ({ id: cs.id, label: shiftLabel(cs) })),
                          }))}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {ctx.can("openShifts") ? (
        <Card>
          <CardHeader>
            <CardTitle>Open shifts</CardTitle>
            <CardDescription>Extra hours you can pick up.</CardDescription>
          </CardHeader>
          <CardContent>
            {openShifts.length === 0 ? (
              <p className="text-muted-foreground text-sm">No open shifts right now.</p>
            ) : (
              <ul className="divide-y">
                {openShifts.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      {shiftLabel(s)}
                      <span className="text-muted-foreground block text-xs">
                        {s.location.name}
                        {s.position ? ` · ${s.position.name}` : ""}
                      </span>
                    </span>
                    {s.claims[0] ? <Badge tone="info">Requested</Badge> : <ClaimShiftButton id={s.id} />}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {ctx.can("availability") ? (
        <Card>
          <CardHeader>
            <CardTitle>My availability</CardTitle>
            <CardDescription>Your manager sees this when building the schedule.</CardDescription>
          </CardHeader>
          <CardContent>
            <AvailabilityEditor
              initial={availability
                .filter((a) => a.weekday !== null && !a.date)
                .map((a) => ({
                  weekday: a.weekday!,
                  available: a.available,
                  start: toHHMM(a.startMinute),
                  end: toHHMM(Math.min(a.endMinute, 1439)),
                }))}
              dates={availability
                .filter((a) => a.date)
                .map((a) => ({
                  id: a.id,
                  date: formatKey(utcDateToKey(a.date!)),
                  note: a.note ?? (a.available ? `available ${minuteToLabel(a.startMinute)}` : null),
                }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

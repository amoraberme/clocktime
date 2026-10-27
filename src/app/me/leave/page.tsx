import type { Metadata } from "next";
import { CancelLeave, LeaveRequestForm } from "@/components/leave/leave-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/misc";
import { dateKey, formatKey, utcDateToKey } from "@/lib/time";
import { requireContext } from "@/server/context";
import { leaveBalances } from "@/server/services/leave";

export const metadata: Metadata = { title: "Time off" };

export default async function MyLeavePage() {
  const ctx = await requireContext();
  if (!ctx.can("leave"))
    return (
      <p className="text-muted-foreground text-sm">Time-off requests aren&apos;t enabled for your company.</p>
    );
  const today = dateKey(new Date(), ctx.company.timezone);
  const year = Number(today.slice(0, 4));
  const [balances, requests] = await Promise.all([
    leaveBalances(ctx, ctx.employee, year),
    ctx.db.leaveRequest.findMany({
      where: { employeeId: ctx.employee.id },
      include: { leaveType: true },
      orderBy: { startDate: "desc" },
      take: 20,
    }),
  ]);
  const tracked = balances.filter((b) => b.remaining != null);
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Time off</h1>
      {tracked.length ? (
        <div className="grid grid-cols-2 gap-3">
          {tracked.map((b) => (
            <Stat
              key={b.type.id}
              label={b.type.name}
              value={`${b.remaining} day${b.remaining === 1 ? "" : "s"}`}
              hint={`${b.used} used of ${b.entitled} in ${year}`}
            />
          ))}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Request time off</CardTitle>
        </CardHeader>
        <CardContent>
          <LeaveRequestForm
            defaultDate={today}
            types={balances.map((b) => ({ id: b.type.id, name: b.type.name, remaining: b.remaining }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>My requests</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground text-sm">No requests yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{r.leaveType.name}</span>
                    <span className="text-muted-foreground block">
                      {formatKey(utcDateToKey(r.startDate))}
                      {r.endDate.getTime() !== r.startDate.getTime()
                        ? ` – ${formatKey(utcDateToKey(r.endDate))}`
                        : ""}{" "}
                      · {r.days}d
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Badge
                      tone={
                        r.status === "APPROVED" ? "success" : r.status === "PENDING" ? "warning" : "neutral"
                      }
                    >
                      {r.status.toLowerCase()}
                    </Badge>
                    {r.status === "PENDING" ||
                    (r.status === "APPROVED" && utcDateToKey(r.startDate) > today) ? (
                      <CancelLeave id={r.id} />
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { Palmtree } from "lucide-react";
import type { Metadata } from "next";
import {
  AddLeaveType,
  CancelLeave,
  DecideLeave,
  EntitlementInput,
  LeaveRequestForm,
} from "@/components/leave/leave-forms";
import { UpgradeCard } from "@/components/upgrade-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { dateKey, formatKey, keyToUtcDate, utcDateToKey } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import { employeeScopeWhere } from "@/server/scope";
import { leaveBalances } from "@/server/services/leave";

export const metadata: Metadata = { title: "Time off" };

const range = (s: Date, e: Date) => {
  const a = utcDateToKey(s);
  const b = utcDateToKey(e);
  return a === b ? formatKey(a) : `${formatKey(a, { month: "short", day: "numeric" })} – ${formatKey(b)}`;
};

export default async function LeavePage() {
  const ctx = await requireContext("MANAGER");
  if (!ctx.can("leave")) {
    return (
      <>
        <PageHeader title="Time off" />
        <UpgradeCard
          feature="leave"
          title="Leave requests and balances"
          description="Staff request leave from their phone; you approve in one tap. Service Incentive Leave is tracked automatically."
        />
      </>
    );
  }
  const today = dateKey(new Date(), ctx.company.timezone);
  const year = Number(today.slice(0, 4));
  const scope = { employee: employeeScopeWhere(ctx) };
  const [pending, upcoming, employees, types] = await Promise.all([
    ctx.db.leaveRequest.findMany({
      where: { status: "PENDING", ...scope },
      include: { employee: true, leaveType: true },
      orderBy: { startDate: "asc" },
    }),
    ctx.db.leaveRequest.findMany({
      where: { status: "APPROVED", endDate: { gte: keyToUtcDate(today) }, ...scope },
      include: { employee: true, leaveType: true },
      orderBy: { startDate: "asc" },
      take: 50,
    }),
    ctx.db.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { firstName: "asc" } }),
    ctx.db.leaveType.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
  ]);
  const balances = await Promise.all(
    employees.map(async (e) => ({ e, b: await leaveBalances(ctx, e, year) })),
  );

  return (
    <>
      <PageHeader
        title="Time off"
        description="Requests, upcoming leave and balances."
        actions={ctx.isAdmin ? <AddLeaveType /> : null}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Waiting for approval ({pending.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <EmptyState icon={Palmtree} title="No pending requests" />
              ) : (
                <ul className="divide-y">
                  {pending.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="flex-1 text-sm">
                        <p className="font-medium">
                          {fullName(r.employee)} · {r.leaveType.name}
                        </p>
                        <p className="text-muted-foreground">
                          {range(r.startDate, r.endDate)} · {r.days} day{r.days === 1 ? "" : "s"}
                          {r.reason ? ` · “${r.reason}”` : ""}
                        </p>
                      </div>
                      <DecideLeave id={r.id} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Upcoming approved leave</CardTitle>
            </CardHeader>
            <Table>
              <TBody>
                {upcoming.length === 0 ? (
                  <TR>
                    <TD className="text-muted-foreground text-center">Nobody is on leave soon.</TD>
                  </TR>
                ) : (
                  upcoming.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-medium">{fullName(r.employee)}</TD>
                      <TD>
                        <Badge tone={r.leaveType.paid ? "success" : "neutral"}>{r.leaveType.name}</Badge>
                      </TD>
                      <TD>{range(r.startDate, r.endDate)}</TD>
                      <TD className="tabular text-right">{r.days}d</TD>
                      <TD className="w-20">
                        <CancelLeave id={r.id} />
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{year} balances (days used / entitled)</CardTitle>
            </CardHeader>
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  {types
                    .filter((t) => t.paid)
                    .map((t) => (
                      <TH key={t.id} className="text-right">
                        {t.code}
                      </TH>
                    ))}
                </tr>
              </THead>
              <TBody>
                {balances.map(({ e, b }) => (
                  <TR key={e.id}>
                    <TD className="font-medium whitespace-nowrap">{fullName(e)}</TD>
                    {b
                      .filter((x) => x.type.paid)
                      .map((x) => (
                        <TD key={x.type.id} className="tabular text-right">
                          <span className="inline-flex items-center gap-1">
                            {x.used} /{" "}
                            {ctx.isAdmin ? (
                              <EntitlementInput
                                employeeId={e.id}
                                leaveTypeId={x.type.id}
                                year={year}
                                value={x.entitled}
                              />
                            ) : (
                              x.entitled
                            )}
                          </span>
                        </TD>
                      ))}
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className="text-muted-foreground px-4 py-3 text-xs">
              SIL: 5 days a year once someone has 1 year of service (Labor Code art. 95). Unused SIL is
              converted to cash in the year-end payroll.
            </p>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Record leave for someone</CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveRequestForm
              defaultDate={today}
              types={types.map((t) => ({ id: t.id, name: t.name, remaining: null }))}
              employees={employees.map((e) => ({ id: e.id, name: fullName(e) }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

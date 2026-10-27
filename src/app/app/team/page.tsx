import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AddEmployeeDialog } from "@/components/team/add-employee-dialog";
import { ImportDialog } from "@/components/team/import-dialog";
import { JoinCodeCard } from "@/components/team/join-code-card";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PLANS } from "@/config/plans";
import { formatPeso } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { cn, fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import { employeeScopeWhere } from "@/server/scope";

export const metadata: Metadata = { title: "Team" };

const STATUS_TABS = [
  { key: "active", label: "Active", statuses: ["ACTIVE", "INVITED"] as const },
  { key: "archived", label: "Archived", statuses: ["ARCHIVED"] as const },
];

const PAY_SUFFIX = { HOURLY: "/hr", DAILY: "/day", MONTHLY: "/mo" } as const;

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const ctx = await requireContext("MANAGER");
  const sp = await searchParams;
  const tab = STATUS_TABS.find((t) => t.key === sp.status) ?? STATUS_TABS[0]!;
  const q = sp.q?.trim();
  const scope = employeeScopeWhere(ctx);
  const [employees, locations, departments, positions, openEntries] = await Promise.all([
    ctx.db.employee.findMany({
      where: {
        status: { in: [...tab.statuses] },
        ...scope,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { employeeNo: { contains: q } },
              ],
            }
          : {}),
      },
      include: {
        position: true,
        department: true,
        locations: { include: { location: { select: { name: true } } } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    ctx.db.location.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    ctx.db.department.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    ctx.db.position.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    ctx.db.timeEntry.findMany({
      where: { clockOutAt: null },
      select: { employeeId: true, breaks: { where: { endAt: null }, select: { id: true } } },
    }),
  ]);
  const onClock = new Map(openEntries.map((e) => [e.employeeId, e.breaks.length > 0 ? "break" : "in"]));
  const seats = await ctx.db.employee.count({ where: { status: { in: ["ACTIVE", "INVITED"] } } });
  const plan = PLANS[ctx.plan];

  return (
    <>
      <PageHeader
        title="Team"
        description={`${seats} ${seats === 1 ? "person" : "people"}${plan.maxSeats ? ` of ${plan.maxSeats} on the ${plan.name} plan` : ""}`}
        actions={
          <>
            {ctx.canViewPay ? <ImportDialog /> : null}
            {ctx.canViewPay ? (
              <AddEmployeeDialog
                locations={locations}
                departments={departments.map((d) => d.name)}
                positions={positions.map((p) => p.name)}
                canAssignRoles={ctx.isAdmin || ctx.isHr}
                features={{
                  hrRoles: ctx.can("hrRoles"),
                  terminals: ctx.can("biometricDevices"),
                  rfid: ctx.can("rfid"),
                  fieldMode: ctx.can("fieldMode"),
                }}
              />
            ) : null}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-muted flex gap-1 rounded-lg p-1">
              {STATUS_TABS.map((t) => (
                <Link
                  key={t.key}
                  href={`/app/team?status=${t.key}`}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm",
                    t.key === tab.key ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </div>
            <form className="min-w-48 flex-1">
              <input type="hidden" name="status" value={tab.key} />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Search name, email or employee no."
                aria-label="Search team"
              />
            </form>
          </div>
          {employees.length === 0 ? (
            <EmptyState
              icon={Users}
              title={q ? "No matches" : "No one here yet"}
              description="Add people one by one or import a spreadsheet."
            />
          ) : (
            <Card>
              <Table>
                <THead>
                  <tr>
                    <TH>Name</TH>
                    <TH>Role</TH>
                    <TH className="hidden md:table-cell">Locations</TH>
                    <TH className="hidden sm:table-cell">Pay</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {employees.map((e) => {
                    const live = onClock.get(e.id);
                    return (
                      <TR key={e.id}>
                        <TD>
                          <Link href={`/app/team/${e.id}`} className="flex items-center gap-3">
                            <Avatar firstName={e.firstName} lastName={e.lastName} color={e.color} size="sm" />
                            <span>
                              <span className="block font-medium hover:underline">{fullName(e)}</span>
                              <span className="text-muted-foreground block text-xs">
                                #{e.employeeNo} {e.position ? `· ${e.position.name}` : ""}{" "}
                                {e.department ? `· ${e.department.name}` : ""}
                              </span>
                            </span>
                          </Link>
                        </TD>
                        <TD>
                          <Badge tone={e.role === "EMPLOYEE" ? "neutral" : "primary"}>
                            {e.role.toLowerCase()}
                          </Badge>
                        </TD>
                        <TD className="text-muted-foreground hidden md:table-cell">
                          {e.locations.map((l) => l.location.name).join(", ") || "—"}
                        </TD>
                        <TD className="tabular hidden sm:table-cell">
                          {e.rateCentavos ? `${formatPeso(e.rateCentavos)}${PAY_SUFFIX[e.payType]}` : "—"}
                        </TD>
                        <TD>
                          {e.status === "INVITED" ? (
                            <Badge tone="info">Invited</Badge>
                          ) : e.status === "ARCHIVED" ? (
                            <Badge>Archived</Badge>
                          ) : (
                            <span className="flex items-center gap-2 text-sm whitespace-nowrap">
                              <StatusDot
                                tone={live === "in" ? "success" : live === "break" ? "warning" : "neutral"}
                              />
                              {live === "in"
                                ? "Clocked in"
                                : live === "break"
                                  ? "On break"
                                  : e.lastSeenAt
                                    ? `Seen ${formatDateTime(e.lastSeenAt, ctx.company.timezone)}`
                                    : "Not clocked in"}
                            </span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <JoinCodeCard
            code={ctx.company.joinCode}
            appUrl={process.env.APP_URL ?? "http://localhost:3000"}
            canReset={ctx.isAdmin}
          />
        </div>
      </div>
    </>
  );
}

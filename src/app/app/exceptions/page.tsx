import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ExceptionActions,
  OvertimeDecision,
  ResolveAllButton,
} from "@/components/exceptions/exception-actions";
import { UpgradeCard } from "@/components/upgrade-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ExceptionType } from "@/generated/prisma/enums";
import { formatKey, formatMinutes, utcDateToKey } from "@/lib/time";
import { cn, fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import { EXCEPTION_LABELS } from "@/server/services/exceptions";

export const metadata: Metadata = { title: "Exceptions" };

const TONE: Partial<Record<ExceptionType, "danger" | "warning" | "info">> = {
  MISSED_CLOCK_OUT: "danger",
  NO_SHOW: "danger",
  UNAPPROVED_OVERTIME: "warning",
  NO_REST_DAY: "warning",
  OUTSIDE_GEOFENCE: "warning",
};

function describe(type: ExceptionType, d: Record<string, unknown>) {
  switch (type) {
    case "LATE_ARRIVAL":
      return `${d.minutes} min late (scheduled ${d.scheduled})`;
    case "EARLY_DEPARTURE":
      return `Left ${d.minutes} min early (scheduled ${d.scheduled})`;
    case "LONG_BREAK":
      return `Break of ${d.minutes} min`;
    case "UNAPPROVED_OVERTIME":
      return `${formatMinutes(Number(d.minutes))} overtime, ${formatMinutes(Number(d.approved ?? 0))} approved`;
    case "NO_SHOW":
      return `Scheduled ${d.scheduled}`;
    case "MISSED_CLOCK_OUT":
      return "Still clocked in. Add the clock-out on their timesheet.";
    case "MISSED_MEAL_BREAK":
      return `${formatMinutes(Number(d.minutes))} without a recorded break`;
    case "OUTSIDE_GEOFENCE":
      return `${d.clockIn ? "Clock-in" : ""}${d.clockIn && d.clockOut ? " and " : ""}${d.clockOut ? "clock-out" : ""} outside the site`;
    default:
      return "";
  }
}

export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; type?: string }>;
}) {
  const ctx = await requireContext("MANAGER");
  if (!ctx.can("exceptions")) {
    return (
      <>
        <PageHeader title="Exceptions" />
        <UpgradeCard
          feature="exceptions"
          title="Catch problems before payroll"
          description="Missed punches, late arrivals, long breaks, no-shows and unapproved overtime, flagged automatically in one inbox."
        />
      </>
    );
  }
  const sp = await searchParams;
  const tab = sp.tab === "resolved" ? "resolved" : sp.tab === "overtime" ? "overtime" : "open";
  const scope = ctx.managedLocationIds
    ? { employee: { locations: { some: { locationId: { in: ctx.managedLocationIds } } } } }
    : {};
  const [rows, counts, overtime] = await Promise.all([
    tab === "overtime"
      ? []
      : ctx.db.timeException.findMany({
          where: {
            status: tab === "open" ? "OPEN" : { in: ["RESOLVED", "DISMISSED"] },
            ...(sp.type ? { type: sp.type as ExceptionType } : {}),
            ...scope,
          },
          include: { employee: true },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: 200,
        }),
    ctx.db.timeException.groupBy({ by: ["type"], where: { status: "OPEN", ...scope }, _count: true }),
    ctx.can("overtime")
      ? ctx.db.overtimeRequest.findMany({
          where: { status: "PENDING", ...scope },
          include: { employee: true },
          orderBy: { date: "asc" },
        })
      : [],
  ]);
  const totalOpen = counts.reduce((s, c) => s + c._count, 0);
  const tabs = [
    { key: "open", label: `Open (${totalOpen})` },
    { key: "overtime", label: `Overtime requests (${overtime.length})` },
    { key: "resolved", label: "Resolved" },
  ];

  return (
    <>
      <PageHeader
        title="Exceptions"
        description="Issues to sort out before payroll. New ones appear as people punch."
        actions={tab === "open" ? <ResolveAllButton ids={rows.map((r) => r.id)} /> : null}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="bg-muted flex gap-1 rounded-lg p-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/app/exceptions?tab=${t.key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                tab === t.key ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        {tab === "open"
          ? counts.map((c) => (
              <Link key={c.type} href={`/app/exceptions?type=${c.type}`}>
                <Badge tone={sp.type === c.type ? "primary" : (TONE[c.type] ?? "neutral")}>
                  {EXCEPTION_LABELS[c.type]} · {c._count}
                </Badge>
              </Link>
            ))
          : null}
      </div>

      {tab === "overtime" ? (
        overtime.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No overtime waiting for approval" />
        ) : (
          <Card>
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Date</TH>
                  <TH>Hours</TH>
                  <TH>Reason</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {overtime.map((o) => (
                  <TR key={o.id}>
                    <TD className="font-medium">{fullName(o.employee)}</TD>
                    <TD>{formatKey(utcDateToKey(o.date))}</TD>
                    <TD className="tabular">{formatMinutes(o.minutes)}</TD>
                    <TD className="text-muted-foreground">{o.reason}</TD>
                    <TD>
                      <OvertimeDecision id={o.id} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={tab === "open" ? "Nothing to review" : "No resolved exceptions yet"}
          description="Your team's punches look clean."
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH>Date</TH>
                <TH>Issue</TH>
                <TH className="hidden md:table-cell">Details</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {rows.map((x) => (
                <TR key={x.id}>
                  <TD>
                    <Link
                      href={`/app/timesheets/${x.employeeId}?start=${utcDateToKey(x.date)}`}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      <Avatar
                        firstName={x.employee.firstName}
                        lastName={x.employee.lastName}
                        color={x.employee.color}
                        size="sm"
                      />
                      {fullName(x.employee)}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap">{formatKey(utcDateToKey(x.date))}</TD>
                  <TD>
                    <Badge tone={TONE[x.type] ?? "info"}>{EXCEPTION_LABELS[x.type]}</Badge>
                  </TD>
                  <TD className="text-muted-foreground hidden text-sm md:table-cell">
                    {describe(x.type, x.details as Record<string, unknown>)}
                    {x.resolutionNote ? (
                      <span className="block text-xs">Note: {x.resolutionNote}</span>
                    ) : null}
                  </TD>
                  <TD>
                    {x.status === "OPEN" ? (
                      <ExceptionActions id={x.id} type={x.type} />
                    ) : (
                      <Badge>{x.status.toLowerCase()}</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}

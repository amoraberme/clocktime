import type { Metadata } from "next";
import Link from "next/link";
import { CostChart, HoursChart } from "@/components/insights/charts";
import { UpgradeCard } from "@/components/upgrade-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, PageHeader, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatPeso } from "@/lib/money";
import { formatKey, formatMinutes } from "@/lib/time";
import { cn, fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import { insightsData } from "@/server/queries/insights";

export const metadata: Metadata = { title: "Insights" };

const RANGES = [4, 8, 12];

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string; location?: string }>;
}) {
  const ctx = await requireContext("MANAGER");
  if (!ctx.can("insights")) {
    return (
      <>
        <PageHeader title="Insights" />
        <UpgradeCard
          feature="insights"
          title="See where labor hours and cost go"
          description="Scheduled vs worked hours, overtime, lateness and labor cost by week and by person."
        />
      </>
    );
  }
  const sp = await searchParams;
  const weeks = RANGES.includes(Number(sp.weeks)) ? Number(sp.weeks) : 8;
  const locationId =
    ctx.managedLocationIds?.length === 1 ? ctx.managedLocationIds[0]! : (sp.location ?? null);
  const { rows, people, range } = await insightsData(ctx, weeks, locationId);
  const totals = rows.reduce(
    (t, r) => ({
      scheduled: t.scheduled + r.scheduled,
      worked: t.worked + r.worked,
      overtime: t.overtime + r.overtime,
      late: t.late + r.late,
      cost: t.cost + r.cost,
    }),
    { scheduled: 0, worked: 0, overtime: 0, late: 0, cost: 0 },
  );
  const chart = rows.map((r) => ({
    label: formatKey(r.week, { month: "short", day: "numeric" }),
    scheduled: r.scheduled / 60,
    worked: r.worked / 60,
    overtime: r.overtime / 60,
    cost: r.cost / 100,
    late: r.late,
  }));
  const variance = totals.scheduled ? ((totals.worked - totals.scheduled) / totals.scheduled) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Insights"
        description={`${formatKey(range.start)} – ${formatKey(range.end)}`}
        actions={
          <div className="bg-muted flex gap-1 rounded-lg p-1 text-sm">
            {RANGES.map((w) => (
              <Link
                key={w}
                href={`/app/insights?weeks=${w}`}
                className={cn(
                  "rounded-md px-3 py-1.5",
                  w === weeks ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
                )}
              >
                {w} weeks
              </Link>
            ))}
          </div>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Scheduled" value={formatMinutes(totals.scheduled)} />
        <Stat
          label="Worked"
          value={formatMinutes(totals.worked)}
          hint={`${variance >= 0 ? "+" : ""}${variance.toFixed(1)}% vs schedule`}
        />
        <Stat
          label="Overtime"
          value={formatMinutes(totals.overtime)}
          hint={
            totals.worked ? `${((totals.overtime / totals.worked) * 100).toFixed(1)}% of hours` : undefined
          }
        />
        <Stat label="Late arrivals" value={totals.late} />
        <Stat
          label="Labor cost"
          value={formatPeso(totals.cost)}
          hint="Gross, before employer contributions"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Scheduled vs worked hours</CardTitle>
          </CardHeader>
          <CardContent>
            <HoursChart data={chart} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Weekly labor cost</CardTitle>
          </CardHeader>
          <CardContent>
            <CostChart data={chart} />
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>By person</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              <TH className="text-right">Scheduled</TH>
              <TH className="text-right">Worked</TH>
              <TH className="text-right">Variance</TH>
              <TH className="text-right">Overtime</TH>
              <TH className="text-right">Late days</TH>
              <TH className="text-right">Labor cost</TH>
            </tr>
          </THead>
          <TBody>
            {people
              .sort((a, b) => b.cost - a.cost)
              .map((p) => {
                const v = p.worked - p.scheduled;
                return (
                  <TR key={p.employee.id}>
                    <TD>
                      <span className="flex items-center gap-2 font-medium">
                        <Avatar
                          firstName={p.employee.firstName}
                          lastName={p.employee.lastName}
                          color={p.employee.color}
                          size="sm"
                        />
                        {fullName(p.employee)}
                      </span>
                    </TD>
                    <TD className="tabular text-right">{formatMinutes(p.scheduled)}</TD>
                    <TD className="tabular text-right">{formatMinutes(p.worked)}</TD>
                    <TD
                      className={cn(
                        "tabular text-right",
                        v > 60 ? "text-warning" : v < -60 ? "text-danger" : "text-muted-foreground",
                      )}
                    >
                      {v >= 0 ? "+" : ""}
                      {formatMinutes(v)}
                    </TD>
                    <TD className="tabular text-right">{formatMinutes(p.overtime)}</TD>
                    <TD className="tabular text-right">{p.late}</TD>
                    <TD className="tabular text-right font-medium">{formatPeso(p.cost)}</TD>
                  </TR>
                );
              })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

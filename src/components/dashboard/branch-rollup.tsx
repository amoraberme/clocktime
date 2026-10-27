import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { RegionToday } from "@/server/queries/nationwide";

const n = (v: number, tone?: "warning" | "danger") =>
  v === 0 ? <span className="text-muted-foreground">0</span> : tone ? <Badge tone={tone}>{v}</Badge> : v;

/** Every branch at a glance, grouped by region; click a branch to drill into its live view. */
export function BranchRollup({ regions, showTerminals }: { regions: RegionToday[]; showTerminals: boolean }) {
  const grouped = regions.length > 1 || regions[0]?.region !== "No region";
  return (
    <Card className="mt-6" data-testid="branch-rollup">
      <CardHeader>
        <CardTitle>Branches today</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <tr>
              <TH>Branch</TH>
              <TH className="text-right">Staff</TH>
              <TH className="text-right">Scheduled</TH>
              <TH className="text-right">On the clock</TH>
              <TH className="text-right">Late</TH>
              <TH className="text-right">Absent</TH>
              <TH className="text-right">On leave</TH>
              <TH className="text-right">Field</TH>
              <TH className="text-right">Exceptions</TH>
              {showTerminals ? <TH className="text-right">Terminals</TH> : null}
            </tr>
          </THead>
          <TBody>
            {regions.map((r) => (
              <RegionRows key={r.region} region={r} grouped={grouped} showTerminals={showTerminals} />
            ))}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

function RegionRows({
  region,
  grouped,
  showTerminals,
}: {
  region: RegionToday;
  grouped: boolean;
  showTerminals: boolean;
}) {
  return (
    <>
      {grouped ? (
        <TR className="bg-muted/40 font-medium">
          <TD>{region.region}</TD>
          <TD className="tabular text-right">{region.totals.headcount}</TD>
          <TD className="tabular text-right">{region.totals.scheduled}</TD>
          <TD className="tabular text-right">{region.totals.present}</TD>
          <TD className="tabular text-right">{region.totals.late}</TD>
          <TD className="tabular text-right">{region.totals.absent}</TD>
          <TD className="tabular text-right">{region.totals.onLeave}</TD>
          <TD className="tabular text-right">{region.totals.fieldOnDuty}</TD>
          <TD className="tabular text-right">{region.totals.exceptions}</TD>
          {showTerminals ? (
            <TD className="tabular text-right">
              {region.totals.terminals - region.totals.terminalsOffline}/{region.totals.terminals}
            </TD>
          ) : null}
        </TR>
      ) : null}
      {region.branches.map((b) => (
        <TR key={b.id}>
          <TD className={grouped ? "pl-6" : undefined}>
            <Link href={`/app?branch=${b.id}`} className="font-medium hover:underline">
              {b.name}
            </Link>
            {b.code ? <span className="text-muted-foreground ml-2 text-xs">{b.code}</span> : null}
          </TD>
          <TD className="tabular text-right">{b.headcount}</TD>
          <TD className="tabular text-right">{b.scheduled}</TD>
          <TD className="tabular text-right">{n(b.present)}</TD>
          <TD className="tabular text-right">{n(b.late, "warning")}</TD>
          <TD className="tabular text-right">{n(b.absent, "danger")}</TD>
          <TD className="tabular text-right">{n(b.onLeave)}</TD>
          <TD className="tabular text-right">{n(b.fieldOnDuty)}</TD>
          <TD className="tabular text-right">{n(b.exceptions, "warning")}</TD>
          {showTerminals ? (
            <TD className="tabular text-right">
              {b.terminals === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : b.terminalsOffline ? (
                <Badge tone="danger">{b.terminalsOffline} offline</Badge>
              ) : (
                <Badge tone="success">{b.terminals} online</Badge>
              )}
            </TD>
          ) : null}
        </TR>
      ))}
    </>
  );
}

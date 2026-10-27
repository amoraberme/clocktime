import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NewRunDialog } from "@/components/payroll/payroll-controls";
import { UpgradeCard } from "@/components/upgrade-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatPeso } from "@/lib/money";
import { formatKey, previousPayPeriod, utcDateToKey } from "@/lib/time";
import { requireContext } from "@/server/context";
import { runLabel } from "@/server/services/payroll";
import { currentPeriod } from "@/server/services/timesheets";

export const metadata: Metadata = { title: "Payroll" };

const STATUS_TONE = { DRAFT: "neutral", COMPUTED: "warning", FINALIZED: "info", PAID: "success" } as const;

export default async function PayrollPage() {
  const ctx = await requireContext("ADMIN");
  if (!ctx.can("payroll")) {
    return (
      <>
        <PageHeader title="Payroll" />
        <UpgradeCard
          feature="payroll"
          title="Philippine payroll in one click"
          description="Overtime, night differential and holiday premiums, plus SSS, PhilHealth, Pag-IBIG and BIR withholding, payslips, 13th-month pay and bank files."
        />
      </>
    );
  }
  const runs = await ctx.db.payRun.findMany({
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  const opts = { weekStartsOn: ctx.settings.weekStartsOn, payDateOffsetDays: ctx.settings.payDateOffsetDays };
  const current = currentPeriod(ctx);
  const periods = [current];
  for (let i = 0; i < 5; i++)
    periods.push(previousPayPeriod(periods.at(-1)!, ctx.company.payFrequency, opts));
  const done = new Set(runs.filter((r) => r.kind === "REGULAR").map((r) => utcDateToKey(r.periodStart)));
  const options = periods.map((p) => ({
    date: p.start,
    label: `${formatKey(p.start, { month: "short", day: "numeric" })} – ${formatKey(p.end, { month: "short", day: "numeric", year: "numeric" })} · payday ${formatKey(p.payDate, { month: "short", day: "numeric" })}${done.has(p.start) ? " (already started)" : ""}${p.start === current.start ? " (in progress)" : ""}`,
  }));
  options.push(options.shift()!); // suggest the most recent completed period first

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Calculate, review and finalize pay. Finalizing locks the period's timesheets."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/app/payroll/loans">Loans & recurring pay</Link>
            </Button>
            <NewRunDialog periods={options} year={Number(current.end.slice(0, 4))} />
          </>
        }
      />
      <Alert tone="info" className="mb-6">
        Contribution and tax tables in use: SSS 2025 (15%), PhilHealth 5%, Pag-IBIG 2%, BIR TRAIN 2023. Have
        your accountant confirm them before your first live payroll.
      </Alert>
      {runs.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No pay runs yet"
          description="Run payroll for your last completed pay period to get started."
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Period</TH>
                <TH>Pay date</TH>
                <TH className="text-right">People</TH>
                <TH className="text-right">Gross</TH>
                <TH className="text-right">Net</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {runs.map((r) => {
                const t = r.totals as { gross?: number; net?: number; employees?: number };
                return (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/app/payroll/${r.id}`} className="font-medium hover:underline">
                        {runLabel(r)}
                      </Link>
                    </TD>
                    <TD>{formatKey(utcDateToKey(r.payDate))}</TD>
                    <TD className="tabular text-right">{t.employees ?? 0}</TD>
                    <TD className="tabular text-right">{formatPeso(t.gross ?? 0)}</TD>
                    <TD className="tabular text-right font-medium">{formatPeso(t.net ?? 0)}</TD>
                    <TD>
                      <Badge tone={STATUS_TONE[r.status]}>
                        {r.status === "COMPUTED" ? "ready for review" : r.status.toLowerCase()}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}

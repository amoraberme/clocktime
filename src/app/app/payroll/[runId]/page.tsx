import { ArrowLeft, Download, FileText, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdjustmentDialog, RemoveAdjustment, RunActions } from "@/components/payroll/payroll-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { Alert, PageHeader, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatPeso } from "@/lib/money";
import { formatKey, utcDateToKey } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import { runLabel } from "@/server/services/payroll";

export default async function PayRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const ctx = await requireContext("ADMIN");
  const { runId } = await params;
  const run = await ctx.db.payRun.findUnique({
    where: { id: runId },
    include: {
      items: { include: { employee: true }, orderBy: { employee: { lastName: "asc" } } },
      adjustments: { include: { employee: true } },
    },
  });
  if (!run) notFound();
  const recurring = await ctx.db.payAdjustment.findMany({
    where: { recurring: true, payRunId: null },
    include: { employee: true },
  });
  const t = run.totals as {
    gross?: number;
    net?: number;
    employeeContributions?: number;
    employerContributions?: number;
    tax?: number;
  };
  const editable = run.status === "DRAFT" || run.status === "COMPUTED";
  const period = { start: utcDateToKey(run.periodStart), end: utcDateToKey(run.periodEnd) };
  const [unapproved, openExceptions] =
    run.kind === "REGULAR" && editable
      ? await Promise.all([
          ctx.db.timesheet
            .count({ where: { periodStart: run.periodStart, status: "APPROVED" } })
            .then((approved) => run.items.length - approved),
          ctx.db.timeException.count({
            where: { status: "OPEN", date: { gte: run.periodStart, lte: run.periodEnd } },
          }),
        ])
      : [0, 0];
  const warnings = run.items.filter((i) => (i.warnings as string[]).length > 0);

  return (
    <>
      <Link
        href="/app/payroll"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Payroll
      </Link>
      <PageHeader
        title={runLabel(run)}
        description={
          <>
            Pay date {formatKey(utcDateToKey(run.payDate))} ·{" "}
            <Badge tone={run.status === "PAID" ? "success" : run.status === "FINALIZED" ? "info" : "warning"}>
              {run.status === "COMPUTED" ? "ready for review" : run.status.toLowerCase()}
            </Badge>
          </>
        }
        actions={
          <>
            {editable ? (
              <AdjustmentDialog
                runId={run.id}
                employees={run.items.map((i) => ({ id: i.employeeId, name: fullName(i.employee) }))}
              />
            ) : null}
            <Dropdown>
              <DropdownTrigger asChild>
                <Button variant="outline">
                  <Download /> Export
                </Button>
              </DropdownTrigger>
              <DropdownContent>
                <DropdownItem asChild>
                  <a href={`/api/export/payroll/${run.id}?format=register-xlsx`}>Payroll register (Excel)</a>
                </DropdownItem>
                <DropdownItem asChild>
                  <a href={`/api/export/payroll/${run.id}?format=register-csv`}>Payroll register (CSV)</a>
                </DropdownItem>
                <DropdownItem asChild>
                  <a href={`/api/export/payroll/${run.id}?format=bank-csv`}>Bank upload file (CSV)</a>
                </DropdownItem>
                <DropdownItem asChild>
                  <a href={`/api/export/payroll/${run.id}?format=contributions-csv`}>
                    SSS / PhilHealth / Pag-IBIG / BIR summary
                  </a>
                </DropdownItem>
              </DropdownContent>
            </Dropdown>
            <RunActions id={run.id} status={run.status} />
          </>
        }
      />
      {editable && (unapproved > 0 || openExceptions > 0) ? (
        <Alert tone="warning" title="Check before finalizing" className="mb-4">
          {unapproved > 0 ? `${unapproved} timesheet(s) aren't approved yet. ` : ""}
          {openExceptions > 0 ? (
            <>
              {openExceptions} open exception(s) in this period.{" "}
              <Link className="underline" href="/app/exceptions">
                Review
              </Link>
            </>
          ) : null}{" "}
          <Link className="underline" href={`/app/timesheets?start=${period.start}`}>
            Open timesheets
          </Link>
        </Alert>
      ) : null}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Gross pay" value={formatPeso(t.gross ?? 0)} />
        <Stat label="Net pay" value={formatPeso(t.net ?? 0)} hint={`${run.items.length} people`} />
        <Stat label="Employee contributions" value={formatPeso(t.employeeContributions ?? 0)} />
        <Stat
          label="Employer contributions"
          value={formatPeso(t.employerContributions ?? 0)}
          hint="SSS + EC, PhilHealth, Pag-IBIG"
        />
        <Stat label="Withholding tax" value={formatPeso(t.tax ?? 0)} />
      </div>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              <TH className="text-right">Gross</TH>
              <TH className="hidden text-right md:table-cell">SSS</TH>
              <TH className="hidden text-right md:table-cell">PhilHealth</TH>
              <TH className="hidden text-right md:table-cell">Pag-IBIG</TH>
              <TH className="text-right">Tax</TH>
              <TH className="hidden text-right lg:table-cell">Other</TH>
              <TH className="text-right">Net</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {run.items.map((i) => (
              <TR key={i.id}>
                <TD>
                  <details>
                    <summary className="cursor-pointer font-medium">
                      {fullName(i.employee)}{" "}
                      {(i.warnings as string[]).length ? (
                        <TriangleAlert className="text-warning inline size-3.5" />
                      ) : null}
                    </summary>
                    <div className="mt-2 grid min-w-[30rem] gap-x-8 gap-y-2 text-xs sm:grid-cols-2">
                      <div>
                        {(i.earnings as { label: string; amount: number }[]).map((e, k) => (
                          <div key={k} className="flex justify-between gap-3">
                            <span>{e.label}</span>
                            <span className="tabular">{formatPeso(e.amount)}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        {(i.deductions as { label: string; amount: number }[]).map((d, k) => (
                          <div key={k} className="flex justify-between gap-3">
                            <span>{d.label}</span>
                            <span className="tabular">−{formatPeso(d.amount)}</span>
                          </div>
                        ))}
                        {(i.warnings as string[]).map((w) => (
                          <p key={w} className="text-warning mt-1">
                            {w}
                          </p>
                        ))}
                      </div>
                    </div>
                  </details>
                </TD>
                <TD className="tabular text-right">{formatPeso(i.grossCentavos)}</TD>
                <TD className="tabular hidden text-right md:table-cell">{formatPeso(i.sssEe)}</TD>
                <TD className="tabular hidden text-right md:table-cell">{formatPeso(i.philhealthEe)}</TD>
                <TD className="tabular hidden text-right md:table-cell">{formatPeso(i.pagibigEe)}</TD>
                <TD className="tabular text-right">{formatPeso(i.withholdingTax)}</TD>
                <TD className="tabular hidden text-right lg:table-cell">{formatPeso(i.otherDeductions)}</TD>
                <TD className="tabular text-right font-semibold">{formatPeso(i.netCentavos)}</TD>
                <TD>
                  {i.payslipKey ? (
                    <Button asChild variant="ghost" size="icon" aria-label="Payslip PDF">
                      <a href={`/api/payslips/${i.id}`} target="_blank" rel="noreferrer">
                        <FileText />
                      </a>
                    </Button>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      {run.adjustments.length + recurring.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Adjustments</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {[...run.adjustments, ...recurring].map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {fullName(a.employee)} · {a.label} <Badge>{a.kind.toLowerCase()}</Badge>{" "}
                    {a.recurring ? <Badge tone="info">every payday</Badge> : null}{" "}
                    {a.taxable ? <Badge tone="warning">taxable</Badge> : null}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="tabular">
                      {a.kind === "DEDUCTION" ? "−" : ""}
                      {formatPeso(a.amountCentavos)}
                    </span>
                    {editable ? <RemoveAdjustment id={a.id} runId={run.id} /> : null}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {warnings.length ? (
        <p className="text-muted-foreground mt-4 text-xs">
          {warnings.length} employee(s) have warnings. Expand a row to see them.
        </p>
      ) : null}
    </>
  );
}

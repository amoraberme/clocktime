import Link from "next/link";
import { CancelLoan, LoanForm } from "@/components/payroll/payroll-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatPeso } from "@/lib/money";
import { dateKey } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";

export default async function LoansPage() {
  const ctx = await requireContext("ADMIN");
  const [loans, employees, recurring] = await Promise.all([
    ctx.db.loan.findMany({
      include: { employee: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    ctx.db.employee.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { firstName: "asc" } }),
    ctx.db.payAdjustment.findMany({
      where: { recurring: true, payRunId: null },
      include: { employee: true },
    }),
  ]);
  return (
    <>
      <PageHeader
        title="Loans & recurring pay"
        description={
          <Link href="/app/payroll" className="underline">
            Back to payroll
          </Link>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Cash advances & company loans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <LoanForm
              employees={employees.map((e) => ({ id: e.id, name: fullName(e) }))}
              today={dateKey(new Date(), ctx.company.timezone)}
            />
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Loan</TH>
                  <TH className="text-right">Amount</TH>
                  <TH className="text-right">Per payday</TH>
                  <TH className="text-right">Balance</TH>
                  <TH>Status</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {loans.map((l) => (
                  <TR key={l.id}>
                    <TD>{fullName(l.employee)}</TD>
                    <TD>{l.label}</TD>
                    <TD className="tabular text-right">{formatPeso(l.principalCentavos)}</TD>
                    <TD className="tabular text-right">{formatPeso(l.amortizationCentavos)}</TD>
                    <TD className="tabular text-right font-medium">{formatPeso(l.balanceCentavos)}</TD>
                    <TD>
                      <Badge
                        tone={l.status === "ACTIVE" ? "info" : l.status === "PAID" ? "success" : "neutral"}
                      >
                        {l.status.toLowerCase()}
                      </Badge>
                    </TD>
                    <TD>{l.status === "ACTIVE" ? <CancelLoan id={l.id} /> : null}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recurring allowances & deductions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {recurring.length === 0 ? (
              <p className="text-muted-foreground">
                Add one from a pay run with “Repeat every payday” ticked.
              </p>
            ) : (
              <ul className="divide-y">
                {recurring.map((a) => (
                  <li key={a.id} className="flex justify-between py-2">
                    <span>
                      {fullName(a.employee)} · {a.label}
                    </span>
                    <span className="tabular">{formatPeso(a.amountCentavos)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

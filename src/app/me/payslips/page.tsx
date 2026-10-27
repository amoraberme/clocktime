import { FileText, Receipt } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { formatPeso } from "@/lib/money";
import { formatKey, utcDateToKey } from "@/lib/time";
import { requireContext } from "@/server/context";
import { runLabel } from "@/server/services/payroll";

export const metadata: Metadata = { title: "Payslips" };

export default async function MyPayslipsPage() {
  const ctx = await requireContext();
  const items = await ctx.db.payRunItem.findMany({
    where: { employeeId: ctx.employee.id, payRun: { status: { in: ["FINALIZED", "PAID"] } } },
    include: { payRun: true },
    orderBy: { payRun: { payDate: "desc" } },
  });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Payslips</h1>
      {items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No payslips yet"
          description="They appear here after each payday."
        />
      ) : (
        items.map((i) => (
          <Card key={i.id}>
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div>
                <p className="font-medium">{runLabel(i.payRun)}</p>
                <p className="text-muted-foreground text-sm">
                  Paid {formatKey(utcDateToKey(i.payRun.payDate))} · gross {formatPeso(i.grossCentavos)}
                </p>
              </div>
              <div className="text-right">
                <p className="tabular text-lg font-semibold">{formatPeso(i.netCentavos)}</p>
                {i.payslipKey ? (
                  <a
                    href={`/api/payslips/${i.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-sm"
                  >
                    <FileText className="size-4" /> PDF
                  </a>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

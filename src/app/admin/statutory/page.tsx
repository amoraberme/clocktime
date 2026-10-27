import { StatutoryForm } from "@/components/admin/admin-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/server/db";

export default async function StatutoryPage() {
  const tables = await prisma.statutoryTable.findMany({
    orderBy: [{ kind: "asc" }, { effectiveFrom: "desc" }],
  });
  const latest: Record<string, string> = {};
  for (const t of tables) latest[t.kind] ??= JSON.stringify(t.data, null, 2);
  return (
    <>
      <PageHeader
        title="Statutory tables"
        description="Contribution rates, tax brackets and premium multipliers, versioned by effective date. Payroll picks the version in effect on each pay date."
      />
      <Card className="mb-6">
        <Table>
          <THead>
            <tr>
              <TH>Kind</TH>
              <TH>Effective from</TH>
              <TH>Version</TH>
              <TH>Source</TH>
            </tr>
          </THead>
          <TBody>
            {tables.map((t) => (
              <TR key={t.id}>
                <TD className="font-mono text-xs">{t.kind}</TD>
                <TD>{t.effectiveFrom.toISOString().slice(0, 10)}</TD>
                <TD>{t.version}</TD>
                <TD className="text-muted-foreground">{t.source}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Add or replace a version</CardTitle>
        </CardHeader>
        <CardContent>
          <StatutoryForm
            kinds={["SSS", "PHILHEALTH", "PAGIBIG", "WITHHOLDING_TAX", "PREMIUMS"]}
            defaults={latest}
          />
        </CardContent>
      </Card>
    </>
  );
}

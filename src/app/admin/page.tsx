import { CompanyPlanDialog } from "@/components/admin/admin-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatPeso } from "@/lib/money";
import { effectivePlan } from "@/lib/entitlements";
import { prisma } from "@/server/db";

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [companies, revenue] = await Promise.all([
    prisma.company.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q } }] } : {},
      include: { _count: { select: { employees: { where: { status: { not: "ARCHIVED" } } } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.billingInvoice.aggregate({
      where: { status: "paid", paidAt: { gte: daysAgo(30) } },
      _sum: { amountCentavos: true },
    }),
  ]);
  const byPlan = (p: string) => companies.filter((c) => effectivePlan(c) === p).length;
  return (
    <>
      <PageHeader title="Companies" description={`${companies.length} shown`} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pro" value={byPlan("PRO")} />
        <Stat label="Starter" value={byPlan("STARTER")} />
        <Stat label="Free" value={byPlan("FREE")} />
        <Stat label="Paid last 30 days" value={formatPeso(revenue._sum.amountCentavos ?? 0)} />
      </div>
      <form className="mb-4 max-w-sm">
        <Input name="q" defaultValue={q} placeholder="Search companies" aria-label="Search companies" />
      </form>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Company</TH>
              <TH>Plan</TH>
              <TH className="text-right">People</TH>
              <TH>Paid through / trial</TH>
              <TH>Created</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {companies.map((c) => (
              <TR key={c.id}>
                <TD>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground block text-xs">
                    {c.slug} · code {c.joinCode}
                  </span>
                </TD>
                <TD>
                  <Badge
                    tone={
                      c.planStatus === "ACTIVE"
                        ? "success"
                        : c.planStatus === "PAST_DUE"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {c.plan} · {c.planStatus.toLowerCase()}
                  </Badge>
                </TD>
                <TD className="tabular text-right">{c._count.employees}</TD>
                <TD className="text-sm">
                  {(c.paidThrough ?? c.trialEndsAt)?.toISOString().slice(0, 10) ?? "—"}
                </TD>
                <TD className="text-sm">{c.createdAt.toISOString().slice(0, 10)}</TD>
                <TD>
                  <CompanyPlanDialog
                    id={c.id}
                    name={c.name}
                    values={{
                      plan: c.plan,
                      planStatus: c.planStatus,
                      paidThrough: c.paidThrough?.toISOString().slice(0, 10) ?? null,
                      trialEndsAt: c.trialEndsAt?.toISOString().slice(0, 10) ?? null,
                    }}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

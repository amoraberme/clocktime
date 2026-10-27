import { PlanPicker, SimulatePayment, type PlanCard } from "@/components/billing/plan-picker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ANNUAL_DISCOUNT_PERCENT, PLANS } from "@/config/plans";
import { trialDaysLeft } from "@/lib/entitlements";
import { formatPeso } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { requireContext } from "@/server/context";
import { paymongoConfigured } from "@/server/billing/paymongo";
import { activeSeatCount } from "@/server/services/company";
import { quote } from "@/server/services/billing";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ simulate?: string; paid?: string; canceled?: string }>;
}) {
  const ctx = await requireContext("ADMIN");
  const sp = await searchParams;
  const tz = ctx.company.timezone;
  const [seats, invoices] = await Promise.all([
    activeSeatCount(ctx.company.id),
    ctx.db.billingInvoice.findMany({ orderBy: { createdAt: "desc" }, take: 24 }),
  ]);
  const plans: PlanCard[] = (["FREE", "STARTER", "PRO"] as const).map((id) => {
    const p = PLANS[id];
    return {
      id,
      name: p.name,
      tagline: p.tagline,
      highlights: p.highlights,
      monthly: quote(id, "MONTHLY", seats).amount,
      annual: quote(id, "ANNUAL", seats).amount,
      seats: Math.max(seats, p.includedSeats),
      extraSeat: p.extraSeatCentavos,
      includedSeats: p.includedSeats,
    };
  });
  const c = ctx.company;
  const status =
    c.planStatus === "TRIALING"
      ? `Free trial of ${PLANS[c.plan].name}: ${trialDaysLeft(c)} days left`
      : c.planStatus === "PAST_DUE"
        ? `Payment overdue. Paid features pause after the grace period.`
        : c.plan === "FREE"
          ? "Free plan"
          : `${PLANS[c.plan].name}, paid through ${c.paidThrough ? formatDate(c.paidThrough, tz) : "—"}`;
  const simulate = sp.simulate ? invoices.find((i) => i.id === sp.simulate && i.status === "open") : null;

  return (
    <div className="space-y-6">
      {sp.paid ? (
        <Alert tone="success" title="Thank you!">
          Your payment is being confirmed. It can take a minute to show here.
        </Alert>
      ) : null}
      {sp.canceled ? (
        <Alert tone="warning">Checkout was canceled. You haven&apos;t been charged.</Alert>
      ) : null}
      {simulate ? (
        <Alert tone="info" title="Test mode: PayMongo isn't configured">
          <p className="mb-3">
            Invoice for {formatPeso(simulate.amountCentavos)} ({simulate.description}). In production this
            opens PayMongo checkout.
          </p>
          <SimulatePayment invoiceId={simulate.id} />
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            <span className="font-medium">{status}</span>
            <span className="text-muted-foreground block">
              {seats} active {seats === 1 ? "person" : "people"} ·{" "}
              {ctx.plan !== c.plan
                ? `currently limited to ${PLANS[ctx.plan].name} features`
                : "all plan features available"}
            </span>
          </span>
          {!paymongoConfigured() ? <Badge tone="warning">Payments in test mode</Badge> : null}
        </CardContent>
      </Card>
      <PlanPicker
        plans={plans}
        current={{ plan: c.plan, active: c.planStatus === "ACTIVE" }}
        discount={ANNUAL_DISCOUNT_PERCENT}
      />
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>Description</TH>
              <TH className="text-right">Amount</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {invoices.length === 0 ? (
              <TR>
                <TD colSpan={4} className="text-muted-foreground text-center">
                  No invoices yet.
                </TD>
              </TR>
            ) : (
              invoices.map((i) => (
                <TR key={i.id}>
                  <TD>{formatDate(i.createdAt, tz)}</TD>
                  <TD>{i.description}</TD>
                  <TD className="tabular text-right">{formatPeso(i.amountCentavos)}</TD>
                  <TD>
                    {i.status === "paid" ? (
                      <Badge tone="success">Paid {i.paidAt ? formatDate(i.paidAt, tz) : ""}</Badge>
                    ) : i.checkoutUrl ? (
                      <a className="text-primary text-sm underline" href={i.checkoutUrl}>
                        Pay now
                      </a>
                    ) : (
                      <Badge>{i.status}</Badge>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

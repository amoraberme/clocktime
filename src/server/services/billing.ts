import "server-only";
import {
  ANNUAL_DISCOUNT_PERCENT,
  annualPriceCentavos,
  monthlyPriceCentavos,
  PLANS,
  PAST_DUE_GRACE_DAYS,
} from "@/config/plans";
import type { BillingInterval, Plan } from "@/generated/prisma/enums";
import { formatPeso } from "@/lib/money";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import type { AppContext } from "../context";
import { prisma } from "../db";
import { escapeHtml, layout, sendEmail } from "../email";
import { createCheckoutSession, paymongoConfigured, type PaymongoEvent } from "../billing/paymongo";
import { activeSeatCount } from "./company";

/** Simulated checkout when PayMongo isn't configured: always in dev, in production only with BILLING_TEST_MODE=1 (e2e). */
export function billingTestMode() {
  return (
    !process.env.PAYMONGO_SECRET_KEY &&
    (process.env.NODE_ENV !== "production" || process.env.BILLING_TEST_MODE === "1")
  );
}

export function quote(plan: Plan, interval: BillingInterval, seats: number) {
  const billedSeats = Math.max(seats, PLANS[plan].includedSeats);
  const amount =
    interval === "ANNUAL" ? annualPriceCentavos(plan, billedSeats) : monthlyPriceCentavos(plan, billedSeats);
  return {
    amount,
    seats: billedSeats,
    monthlyEquivalent: interval === "ANNUAL" ? Math.round(amount / 12) : amount,
  };
}

function addInterval(from: Date, interval: BillingInterval) {
  const d = new Date(from);
  if (interval === "ANNUAL") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Create an invoice and a PayMongo checkout (or a test-mode simulated checkout when PayMongo isn't configured). */
export async function startCheckout(ctx: AppContext, plan: Plan, interval: BillingInterval) {
  if (plan === "FREE") throw new UserError("Choose a paid plan.");
  if (!ctx.isAdmin) throw new UserError("Only owners and admins can manage billing.");
  const seats = await activeSeatCount(ctx.company.id);
  const q = quote(plan, interval, seats);
  const start =
    ctx.company.paidThrough && ctx.company.paidThrough > new Date() ? ctx.company.paidThrough : new Date();
  const description = `ClockTime ${PLANS[plan].name} · ${interval === "ANNUAL" ? "1 year" : "1 month"} · up to ${q.seats} people`;
  const invoice = await prisma.billingInvoice.create({
    data: {
      companyId: ctx.company.id,
      description,
      amountCentavos: q.amount,
      status: "open",
      plan,
      interval,
      seats: q.seats,
      periodStart: start,
      periodEnd: addInterval(start, interval),
    },
  });
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!paymongoConfigured()) {
    if (!billingTestMode())
      throw new UserError(
        "Online payment isn't set up yet. Contact ClockTime support to pay by bank transfer.",
      );
    return { url: `/app/settings/billing?simulate=${invoice.id}`, invoiceId: invoice.id };
  }
  const session = await createCheckoutSession({
    invoiceId: invoice.id,
    companyId: ctx.company.id,
    description,
    amountCentavos: q.amount,
    email: ctx.user.email,
    name: ctx.user.name,
    successUrl: `${appUrl}/app/settings/billing?paid=${invoice.id}`,
    cancelUrl: `${appUrl}/app/settings/billing?canceled=1`,
  });
  await prisma.billingInvoice.update({
    where: { id: invoice.id },
    data: { providerInvoiceId: session.id, checkoutUrl: session.attributes.checkout_url },
  });
  await writeAudit(actorFrom(ctx), {
    action: "billing.checkout",
    entityType: "BillingInvoice",
    entityId: invoice.id,
    after: { plan, interval, amount: q.amount },
  });
  return { url: session.attributes.checkout_url, invoiceId: invoice.id };
}

/** Mark an invoice paid and extend the company's plan. Idempotent. */
export async function fulfillInvoice(invoiceId: string, providerPaymentId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.billingInvoice.findUnique({ where: { id: invoiceId }, include: { company: true } });
    if (!inv) throw new Error(`Invoice ${invoiceId} not found`);
    if (inv.status === "paid") return inv;
    if (!inv.plan || !inv.interval) throw new Error("Invoice has no plan");
    const now = new Date();
    const from =
      inv.company.paidThrough && inv.company.paidThrough > now && inv.company.plan === inv.plan
        ? inv.company.paidThrough
        : now;
    const paidThrough = addInterval(from, inv.interval);
    await tx.billingInvoice.update({
      where: { id: inv.id },
      data: {
        status: "paid",
        paidAt: now,
        providerPaymentId: providerPaymentId ?? null,
        periodStart: from,
        periodEnd: paidThrough,
      },
    });
    await tx.company.update({
      where: { id: inv.companyId },
      data: { plan: inv.plan, planStatus: "ACTIVE", paidThrough, trialEndsAt: null },
    });
    await tx.subscription.upsert({
      where: { companyId: inv.companyId },
      create: {
        companyId: inv.companyId,
        plan: inv.plan,
        interval: inv.interval,
        seats: inv.seats ?? 0,
        status: "ACTIVE",
        currentPeriodEnd: paidThrough,
      },
      update: {
        plan: inv.plan,
        interval: inv.interval,
        seats: inv.seats ?? 0,
        status: "ACTIVE",
        currentPeriodEnd: paidThrough,
      },
    });
    await tx.auditLog.create({
      data: {
        companyId: inv.companyId,
        actorLabel: "Billing",
        action: "billing.paid",
        entityType: "BillingInvoice",
        entityId: inv.id,
        after: { plan: inv.plan, paidThrough },
      },
    });
    return inv;
  });
}

/** Process a verified PayMongo webhook event. Idempotent per event id. */
export async function handlePaymongoEvent(event: PaymongoEvent) {
  const existing = await prisma.billingEvent.findUnique({ where: { eventId: event.id } });
  if (existing?.processedAt) return { duplicate: true };
  const record =
    existing ??
    (await prisma.billingEvent.create({
      data: {
        provider: "paymongo",
        eventId: event.id,
        type: event.attributes.type,
        payload: JSON.parse(JSON.stringify(event)),
      },
    }));
  try {
    if (event.attributes.type === "checkout_session.payment.paid") {
      const attrs = event.attributes.data.attributes as {
        metadata?: { invoiceId?: string };
        reference_number?: string;
        payments?: { id: string }[];
      };
      const invoiceId = attrs.metadata?.invoiceId ?? attrs.reference_number;
      if (invoiceId) {
        const inv = await fulfillInvoice(invoiceId, attrs.payments?.[0]?.id);
        await prisma.billingEvent.update({ where: { id: record.id }, data: { companyId: inv.companyId } });
      }
    }
    await prisma.billingEvent.update({
      where: { id: record.id },
      data: { processedAt: new Date(), error: null },
    });
    return { ok: true };
  } catch (err) {
    await prisma.billingEvent.update({ where: { id: record.id }, data: { error: String(err) } });
    throw err;
  }
}

export async function downgradeToFree(ctx: AppContext) {
  if (!ctx.isAdmin) throw new UserError("Only owners and admins can manage billing.");
  const seats = await activeSeatCount(ctx.company.id);
  if (seats > PLANS.FREE.maxSeats!)
    throw new UserError(
      `The Free plan is for up to ${PLANS.FREE.maxSeats} people. Archive team members first (you have ${seats}).`,
    );
  await prisma.company.update({
    where: { id: ctx.company.id },
    data: { plan: "FREE", planStatus: "ACTIVE", trialEndsAt: null },
  });
  await prisma.subscription.updateMany({
    where: { companyId: ctx.company.id },
    data: { status: "CANCELED" },
  });
  await writeAudit(actorFrom(ctx), {
    action: "billing.downgrade",
    entityType: "Company",
    entityId: ctx.company.id,
  });
}

/** Daily: move lapsed companies to past-due and send renewal reminders. */
export async function billingSweep(now = new Date()) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const day = 86_400_000;
  const companies = await prisma.company.findMany({
    where: { plan: { not: "FREE" } },
    include: { employees: { where: { role: { in: ["OWNER", "ADMIN"] }, status: "ACTIVE" } } },
  });
  let reminders = 0;
  for (const c of companies) {
    const admins = c.employees.filter((e) => e.email).map((e) => e.email!);
    const notifyAdmins = async (subject: string, body: string) => {
      // A failed email mustn't stop the sweep for every company after this one.
      for (const to of admins)
        await sendEmail({
          to,
          subject,
          html: layout(subject, `<p>${escapeHtml(body)}</p>`, {
            label: "Manage billing",
            url: `${appUrl}/app/settings/billing`,
          }),
        }).catch((err) => console.error("billing reminder email failed", to, err));
      reminders++;
    };
    if (c.planStatus === "ACTIVE" && c.paidThrough) {
      const daysLeft = Math.ceil((c.paidThrough.getTime() - now.getTime()) / day);
      if (daysLeft === 7 || daysLeft === 1)
        await notifyAdmins(
          `Your ClockTime plan renews in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
          `${c.name}'s ${PLANS[c.plan].name} plan is paid through ${c.paidThrough.toDateString()}. Renew to keep every feature.`,
        );
      if (daysLeft <= 0) {
        await prisma.company.update({ where: { id: c.id }, data: { planStatus: "PAST_DUE" } });
        await notifyAdmins(
          "Your ClockTime payment is due",
          `${c.name}'s plan has lapsed. You have ${PAST_DUE_GRACE_DAYS} days to renew before features are paused. Your data is kept.`,
        );
      }
    }
    if (c.planStatus === "TRIALING" && c.trialEndsAt) {
      const daysLeft = Math.ceil((c.trialEndsAt.getTime() - now.getTime()) / day);
      if (daysLeft === 3)
        await notifyAdmins(
          "Your ClockTime trial ends in 3 days",
          `Choose a plan to keep scheduling, kiosk and payroll. Starter is ${formatPeso(PLANS.STARTER.monthlyBaseCentavos)}/month for 5 people.`,
        );
    }
  }
  return { reminders };
}

export { ANNUAL_DISCOUNT_PERCENT };

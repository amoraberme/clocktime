import { createHmac } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { POST as webhook } from "@/app/api/webhooks/paymongo/route";
import { effectivePlan } from "@/lib/entitlements";
import { verifyWebhookSignature } from "@/server/billing/paymongo";
import { prisma } from "@/server/db";
import { billingSweep, quote, startCheckout } from "@/server/services/billing";
import { cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));
const SECRET = "whsk_test_secret";

function signed(body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},te=${sig},li=`;
}

describe("billing", () => {
  it("quotes base + extra seats and the annual discount", () => {
    expect(quote("STARTER", "MONTHLY", 3).amount).toBe(49_900);
    expect(quote("STARTER", "MONTHLY", 8).amount).toBe(49_900 + 3 * 9_900);
    expect(quote("PRO", "ANNUAL", 5).amount).toBe(Math.round(99_900 * 12 * 0.8));
  });

  it("verifies webhook signatures", () => {
    const body = '{"a":1}';
    expect(verifyWebhookSignature(body, signed(body), SECRET)).toBe(true);
    expect(verifyWebhookSignature(body, signed(body, "wrong"), SECRET)).toBe(false);
    expect(verifyWebhookSignature(body + " ", signed(body), SECRET)).toBe(false);
    expect(
      verifyWebhookSignature(body, signed(body, SECRET, Math.floor(Date.now() / 1000) - 3600), SECRET),
    ).toBe(false);
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
  });

  it("activates the plan when PayMongo reports a paid checkout (idempotently)", async () => {
    process.env.PAYMONGO_WEBHOOK_SECRET = SECRET;
    const t = await makeCompany({ plan: "STARTER" });
    created.push(t.company.id);
    await prisma.company.update({
      where: { id: t.company.id },
      data: { planStatus: "TRIALING", trialEndsAt: new Date(Date.now() - 86_400_000) },
    });
    const ctx = {
      ...t.ctx,
      company: await prisma.company.findUniqueOrThrow({ where: { id: t.company.id } }),
    };
    const { invoiceId } = await startCheckout(ctx, "PRO", "MONTHLY");
    const event = {
      data: {
        id: `evt_${invoiceId}`,
        attributes: {
          type: "checkout_session.payment.paid",
          livemode: false,
          data: { id: "cs_1", attributes: { metadata: { invoiceId }, payments: [{ id: "pay_1" }] } },
        },
      },
    };
    const body = JSON.stringify(event);
    const bad = await webhook(
      new Request("http://x/api/webhooks/paymongo", {
        method: "POST",
        body,
        headers: { "paymongo-signature": signed(body, "nope") },
      }),
    );
    expect(bad.status).toBe(401);
    for (let i = 0; i < 2; i++) {
      const res = await webhook(
        new Request("http://x/api/webhooks/paymongo", {
          method: "POST",
          body,
          headers: { "paymongo-signature": signed(body) },
        }),
      );
      expect(res.status).toBe(200);
    }
    const company = await prisma.company.findUniqueOrThrow({ where: { id: t.company.id } });
    expect(company.plan).toBe("PRO");
    expect(company.planStatus).toBe("ACTIVE");
    expect(effectivePlan(company)).toBe("PRO");
    const days = (company.paidThrough!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    expect((await prisma.billingInvoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe("paid");
  });

  it("marks lapsed plans past due", async () => {
    const t = await makeCompany({ plan: "STARTER" });
    created.push(t.company.id);
    await prisma.company.update({
      where: { id: t.company.id },
      data: { planStatus: "ACTIVE", paidThrough: new Date(Date.now() - 3600_000) },
    });
    await billingSweep();
    const c = await prisma.company.findUniqueOrThrow({ where: { id: t.company.id } });
    expect(c.planStatus).toBe("PAST_DUE");
    expect(effectivePlan(c)).toBe("STARTER");
    expect(effectivePlan(c, new Date(Date.now() + 8 * 86_400_000))).toBe("FREE");
  });
});

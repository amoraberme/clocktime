"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, UserError } from "@/server/action";
import { getContextOrThrow } from "@/server/context";
import { billingTestMode, downgradeToFree, fulfillInvoice, startCheckout } from "@/server/services/billing";

export async function checkoutAction(plan: string, interval: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    const p = z.enum(["STARTER", "PRO"]).parse(plan);
    const i = z.enum(["MONTHLY", "ANNUAL"]).parse(interval);
    return (await startCheckout(ctx, p, i)).url;
  });
}

/** Test mode only (no PayMongo keys, not production): pretend the checkout was paid. */
export async function simulatePaymentAction(invoiceId: string) {
  return run(async () => {
    if (!billingTestMode()) throw new UserError("Not available.");
    const ctx = await getContextOrThrow("ADMIN");
    const inv = await ctx.db.billingInvoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new UserError("Invoice not found.");
    await fulfillInvoice(inv.id, "simulated");
    revalidatePath("/app", "layout");
  }, "Payment recorded (test mode). Your plan is active.");
}

export async function downgradeAction() {
  return run(async () => {
    await downgradeToFree(await getContextOrThrow("ADMIN"));
    revalidatePath("/app", "layout");
  }, "You're now on the Free plan.");
}

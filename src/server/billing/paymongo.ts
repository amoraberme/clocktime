import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.paymongo.com/v1";

export function paymongoConfigured() {
  return Boolean(process.env.PAYMONGO_SECRET_KEY);
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throw new Error("PAYMONGO_SECRET_KEY is not set");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; errors?: { detail?: string }[] };
  if (!res.ok || !json.data)
    throw new Error(
      `PayMongo ${res.status}: ${json.errors?.map((e) => e.detail).join("; ") ?? "request failed"}`,
    );
  return json.data;
}

export type CheckoutSession = { id: string; attributes: { checkout_url: string; status: string } };

/** Hosted checkout page (cards, GCash, Maya, GrabPay) for one invoice. */
export function createCheckoutSession(input: {
  invoiceId: string;
  companyId: string;
  description: string;
  amountCentavos: number;
  email?: string;
  name?: string;
  successUrl: string;
  cancelUrl: string;
}) {
  return call<CheckoutSession>("/checkout_sessions", {
    data: {
      attributes: {
        line_items: [{ name: input.description, amount: input.amountCentavos, currency: "PHP", quantity: 1 }],
        payment_method_types: ["card", "gcash", "paymaya", "grab_pay"],
        description: input.description,
        reference_number: input.invoiceId,
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        billing: input.email ? { email: input.email, name: input.name } : undefined,
        metadata: { invoiceId: input.invoiceId, companyId: input.companyId },
      },
    },
  });
}

/**
 * Verify the `Paymongo-Signature` header: "t=<timestamp>,te=<test sig>,li=<live sig>",
 * where each signature is HMAC-SHA256(secret, `${t}.${rawBody}`) in hex.
 */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
  now = Date.now(),
) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=").map((s) => s.trim()) as [string, string]),
  );
  const t = parts.t;
  if (!t || Math.abs(now / 1000 - Number(t)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return [parts.te, parts.li].some((sig) => {
    if (!sig || sig.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
}

export type PaymongoEvent = {
  id: string;
  attributes: { type: string; livemode: boolean; data: { id: string; attributes: Record<string, unknown> } };
};

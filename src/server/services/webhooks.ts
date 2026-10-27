import "server-only";
import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { effectivePlan, hasFeature } from "@/lib/entitlements";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import { requireFeature, type AppContext } from "../context";
import { decrypt, encrypt, randomToken } from "../crypto";
import { prisma } from "../db";

export const WEBHOOK_EVENTS = [
  "punch.created",
  "attendance.updated",
  "request.approved",
  "request.declined",
  "payrun.finalized",
  "employee.updated",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number] | "webhook.test";

export const WEBHOOK_EVENT_LABELS: Record<(typeof WEBHOOK_EVENTS)[number], string> = {
  "punch.created": "A punch was recorded (any method)",
  "attendance.updated": "Terminal logs or an import changed someone's attendance",
  "request.approved": "Leave, overtime, schedule change or correction approved",
  "request.declined": "A request was declined",
  "payrun.finalized": "Payroll finalized",
  "employee.updated": "An employee was added, changed or archived",
};

/** Retry delays after each failed attempt; then the delivery is marked failed. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 360, 720, 1440];

function privateIp(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return privateIp(mapped[1]!);
  // URL() normalizes IPv4-mapped addresses to hex (::ffff:c0a8:101).
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (hex) {
    const [hi, lo] = [parseInt(hex[1]!, 16), parseInt(hex[2]!, 16)];
    return privateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (isIP(ip) === 6) return ip === "::1" || ip === "::" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip);
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    a >= 224 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** HTTPS only, and never internal addresses (so webhooks can't be pointed at our own network). */
export function validateWebhookUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UserError("Enter a full URL, e.g. https://payroll.example.com/clocktime");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const dev = process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1");
  if (url.protocol !== "https:" && !dev) throw new UserError("Webhook URLs must use https://.");
  if (
    !dev &&
    (host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      (isIP(host) && privateIp(host)))
  )
    throw new UserError("Webhook URLs must be public internet addresses.");
  if (url.username || url.password) throw new UserError("Put credentials in your receiver, not in the URL.");
  return url.toString();
}

/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`, the same scheme receivers can verify. */
export function signPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

/**
 * Queue an event for every endpoint subscribed to it, then try delivering right after the response
 * (the 15-minute cron retries anything that didn't go through).
 */
export async function emitEvent(
  companyId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  endpointId?: string,
) {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { companyId, active: true, ...(endpointId ? { id: endpointId } : { events: { has: event } }) },
      include: { company: true },
    });
    const live = endpoints.filter((e) => hasFeature(effectivePlan(e.company), "webhooks"));
    if (!live.length) return;
    await prisma.webhookDelivery.createMany({
      data: live.map((e) => ({
        endpointId: e.id,
        event,
        payload: { event, companyId, createdAt: new Date().toISOString(), data } as Prisma.InputJsonValue,
      })),
    });
    try {
      after(() => deliverPending(25).catch((err) => console.error("webhook delivery failed", err)));
    } catch {
      // Outside a request (scripts, tests): the cron delivers.
    }
  } catch (err) {
    console.error("emitEvent failed", err);
  }
}

/** Add an endpoint. Returns the signing secret, which is only shown this once. */
export async function createWebhook(ctx: AppContext, input: { url: string; events: string[] }) {
  requireFeature(ctx, "webhooks");
  const url = validateWebhookUrl(input.url.trim());
  const events = [...new Set(input.events)].filter((e): e is (typeof WEBHOOK_EVENTS)[number] =>
    (WEBHOOK_EVENTS as readonly string[]).includes(e),
  );
  if (!events.length) throw new UserError("Pick at least one event.");
  if ((await ctx.db.webhookEndpoint.count()) >= 10) throw new UserError("You can have up to 10 webhooks.");
  const secret = `whsec_${randomToken(24)}`;
  const row = await ctx.db.webhookEndpoint.create({
    data: { companyId: ctx.company.id, url, events, secretEnc: encrypt(secret)! },
  });
  await writeAudit(actorFrom(ctx), {
    action: "webhook.create",
    entityType: "WebhookEndpoint",
    entityId: row.id,
    after: { url, events },
  });
  return { secret, row };
}

export async function deleteWebhook(ctx: AppContext, id: string) {
  const row = await ctx.db.webhookEndpoint.findUnique({ where: { id } });
  if (!row) throw new UserError("Webhook not found.");
  await ctx.db.webhookEndpoint.delete({ where: { id } });
  await writeAudit(actorFrom(ctx), {
    action: "webhook.delete",
    entityType: "WebhookEndpoint",
    entityId: id,
    before: { url: row.url, events: row.events },
  });
}

export async function setWebhookActive(ctx: AppContext, id: string, active: boolean) {
  const row = await ctx.db.webhookEndpoint.findUnique({ where: { id } });
  if (!row) throw new UserError("Webhook not found.");
  await ctx.db.webhookEndpoint.update({ where: { id }, data: { active } });
  await writeAudit(actorFrom(ctx), {
    action: active ? "webhook.enable" : "webhook.disable",
    entityType: "WebhookEndpoint",
    entityId: id,
  });
}

/** Send a `webhook.test` event to one endpoint now and report how it went. */
export async function testWebhook(ctx: AppContext, id: string) {
  requireFeature(ctx, "webhooks");
  const row = await ctx.db.webhookEndpoint.findUnique({ where: { id } });
  if (!row) throw new UserError("Webhook not found.");
  if (!row.active) throw new UserError("Turn the webhook on first.");
  await emitEvent(ctx.company.id, "webhook.test", { message: "Hello from ClockTime" }, id);
  const d = await prisma.webhookDelivery.findFirst({
    where: { endpointId: id, event: "webhook.test", status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (d) await deliverOne(d.id);
  const after = d ? await prisma.webhookDelivery.findUnique({ where: { id: d.id } }) : null;
  if (after?.status !== "DELIVERED") throw new UserError(`Test failed: ${after?.lastError ?? "not sent"}`);
}

/** Send due deliveries. Safe to run concurrently with itself: each delivery is claimed first. */
export async function deliverPending(limit = 100) {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let delivered = 0;
  for (const d of due) if (await deliverOne(d.id)) delivered++;
  return { due: due.length, delivered };
}

/** The receiver's host must not resolve to a private address (checked again at send time). */
async function resolvesPublic(raw: string) {
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, "");
  if (process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1")) return true;
  const ips = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  return ips.length > 0 && ips.every((a) => !privateIp(a.address));
}

/** Attempt one pending delivery. Returns true when the receiver answered 2xx. */
async function deliverOne(id: string) {
  const d = await prisma.webhookDelivery.findUnique({ where: { id }, include: { endpoint: true } });
  if (!d || d.status !== "PENDING") return false;
  // Claim: push the next attempt out so a parallel run skips it.
  const claimed = await prisma.webhookDelivery.updateMany({
    where: { id: d.id, status: "PENDING", nextAttemptAt: d.nextAttemptAt },
    data: { nextAttemptAt: new Date(Date.now() + 5 * 60_000) },
  });
  if (!claimed.count) return false;
  if (!d.endpoint.active) {
    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: { status: "FAILED", lastError: "Webhook turned off" },
    });
    return false;
  }
  const body = JSON.stringify({ id: d.id, ...(d.payload as object) });
  let status: number | null = null;
  let error: string | null = null;
  try {
    if (!(await resolvesPublic(d.endpoint.url))) throw new Error("Host resolves to a private address");
    const res = await fetch(d.endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ClockTime-Webhooks/1",
        "X-ClockTime-Event": d.event,
        "X-ClockTime-Delivery": d.id,
        "X-ClockTime-Signature": signPayload(decrypt(d.endpoint.secretEnc) ?? "", body),
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : "Request failed";
  }
  const attempts = d.attempts + 1;
  if (!error) {
    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        status: "DELIVERED",
        attempts,
        responseStatus: status,
        deliveredAt: new Date(),
        lastError: null,
      },
    });
    return true;
  }
  const wait = BACKOFF_MINUTES[attempts - 1];
  await prisma.webhookDelivery.update({
    where: { id: d.id },
    data: {
      attempts,
      responseStatus: status,
      lastError: error.slice(0, 300),
      ...(wait === undefined
        ? { status: "FAILED" }
        : { nextAttemptAt: new Date(Date.now() + wait * 60_000) }),
    },
  });
  return false;
}

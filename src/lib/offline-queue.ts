"use client";

import Dexie, { type Table } from "dexie";
import { noteServerTime } from "./client-clock";
import type { PunchPayload } from "./validation/punch";

export type QueuedPunch = PunchPayload & { queuedAt: number; scope: string };
/**
 * Stored form: the punch (with any kiosk PIN, card number, GPS and selfie) is encrypted with a
 * non-extractable AES-GCM key that never leaves this browser. Only routing fields stay readable.
 */
type StoredPunch = Pick<QueuedPunch, "clientId" | "action" | "at" | "queuedAt" | "scope"> & {
  enc?: { iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer };
} & Partial<PunchPayload>;
export type RejectedPunch = { clientId: string; action: string; at?: string; error: string; scope: string };

class PunchDb extends Dexie {
  queue!: Table<StoredPunch, string>;
  rejected!: Table<RejectedPunch, string>;
  keys!: Table<{ id: string; key: CryptoKey }, string>;
  constructor() {
    super("clocktime-punches");
    this.version(1).stores({ queue: "clientId, queuedAt, scope", rejected: "clientId, scope" });
    this.version(2).stores({ queue: "clientId, queuedAt, scope", rejected: "clientId, scope", keys: "id" });
  }
}

async function queueKey(d: PunchDb) {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const stored = await d.keys.get("queue");
  if (stored) return stored.key;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await d.keys.put({ id: "queue", key });
  return key;
}

async function seal(d: PunchDb, scope: string, punch: PunchPayload): Promise<StoredPunch> {
  const meta = { clientId: punch.clientId, action: punch.action, at: punch.at, scope, queuedAt: Date.now() };
  const key = await queueKey(d).catch(() => null);
  if (!key) return { ...punch, ...meta };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(punch)),
  );
  return { ...meta, enc: { iv, data } };
}

async function open(d: PunchDb, row: StoredPunch): Promise<QueuedPunch | null> {
  if (!row.enc) return row as QueuedPunch;
  const key = await queueKey(d).catch(() => null);
  if (!key) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: row.enc.iv }, key, row.enc.data);
    return {
      ...(JSON.parse(new TextDecoder().decode(plain)) as PunchPayload),
      scope: row.scope,
      queuedAt: row.queuedAt,
    };
  } catch {
    return null;
  }
}

let db: PunchDb | null = null;
function getDb() {
  if (typeof indexedDB === "undefined") return null;
  db ??= new PunchDb();
  return db;
}

/** `scope` keeps queues separate per employee (and per kiosk). */
export async function enqueue(scope: string, punch: PunchPayload) {
  const d = getDb();
  if (!d) return;
  await d.queue.put(await seal(d, scope, punch));
}

export async function pending(scope: string): Promise<QueuedPunch[]> {
  const d = getDb();
  if (!d) return [];
  const rows = await d.queue.where("scope").equals(scope).sortBy("queuedAt");
  const out: QueuedPunch[] = [];
  for (const r of rows) {
    const p = await open(d, r);
    if (p) out.push(p);
  }
  return out;
}

export async function rejectedPunches(scope: string) {
  return (await getDb()?.rejected.where("scope").equals(scope).toArray()) ?? [];
}

export async function clearRejected(scope: string) {
  await getDb()?.rejected.where("scope").equals(scope).delete();
}

type SyncResponse<S> = {
  ok: boolean;
  results?: { clientId: string; ok: boolean; error?: string }[];
  state?: S;
  error?: string;
};

const inFlight = new Map<string, Promise<unknown>>();

/** Send queued punches. Returns null when offline/unreachable; otherwise the server response. */
export function flush<S>(
  scope: string,
  endpoint: string,
  extraHeaders: Record<string, string> = {},
): Promise<SyncResponse<S> | null> {
  // One flush per scope at a time; callers that race share the same result.
  const running = inFlight.get(scope);
  if (running) return running as Promise<SyncResponse<S> | null>;
  const p = doFlush<S>(scope, endpoint, extraHeaders).finally(() => inFlight.delete(scope));
  inFlight.set(scope, p);
  return p;
}

async function doFlush<S>(
  scope: string,
  endpoint: string,
  extraHeaders: Record<string, string> = {},
): Promise<SyncResponse<S> | null> {
  const d = getDb();
  if (!d) return null;
  const items = await pending(scope);
  if (items.length === 0) return null;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify({ punches: items.map(({ queuedAt: _q, scope: _s, ...p }) => p) }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  noteServerTime(res);
  const body = (await res.json()) as SyncResponse<S>;
  for (const r of body.results ?? []) {
    const item = items.find((i) => i.clientId === r.clientId);
    await d.queue.delete(r.clientId);
    if (!r.ok && item)
      await d.rejected.put({
        clientId: r.clientId,
        action: item.action,
        at: item.at,
        error: r.error ?? "Rejected",
        scope,
      });
  }
  return body;
}

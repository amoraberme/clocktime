"use client";

import Dexie, { type Table } from "dexie";
import type { PunchPayload } from "./validation/punch";

export type QueuedPunch = PunchPayload & { queuedAt: number; scope: string };
export type RejectedPunch = { clientId: string; action: string; at?: string; error: string; scope: string };

class PunchDb extends Dexie {
  queue!: Table<QueuedPunch, string>;
  rejected!: Table<RejectedPunch, string>;
  constructor() {
    super("clocktime-punches");
    this.version(1).stores({ queue: "clientId, queuedAt, scope", rejected: "clientId, scope" });
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
  await getDb()?.queue.put({ ...punch, scope, queuedAt: Date.now() });
}

export async function pending(scope: string) {
  return (await getDb()?.queue.where("scope").equals(scope).sortBy("queuedAt")) ?? [];
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

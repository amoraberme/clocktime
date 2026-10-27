/**
 * Audit log hash chain. Each entry's hash covers the previous entry's hash and its own content, so
 * changing, deleting or reordering any entry breaks every hash after it. Pure, so the server and
 * the tests compute it the same way.
 */
import { createHash } from "node:crypto";

export type ChainEntry = {
  seq: number;
  companyId: string | null;
  actorUserId: string | null;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
  createdAt: Date;
};

/** JSON with object keys sorted at every level (Postgres jsonb doesn't keep key order). */
export function canonicalJson(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function auditHash(prevHash: string | null, e: ChainEntry) {
  return createHash("sha256")
    .update(
      canonicalJson({
        prev: prevHash,
        seq: e.seq,
        companyId: e.companyId,
        actorUserId: e.actorUserId,
        actorLabel: e.actorLabel,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        before: e.before ?? null,
        after: e.after ?? null,
        reason: e.reason,
        ip: e.ip,
        createdAt: e.createdAt.toISOString(),
      }),
    )
    .digest("hex");
}

export type ChainCheck =
  | { ok: true; checked: number }
  | { ok: false; checked: number; brokenAtSeq: number; problem: "gap" | "link" | "hash" };

/** Check entries in seq order (pass the previous batch's last hash to continue a check). */
export function verifyChain(
  entries: (ChainEntry & { hash: string | null; prevHash: string | null })[],
  start: { seq: number; hash: string | null } = { seq: 0, hash: null },
): ChainCheck & { last: { seq: number; hash: string | null } } {
  let last = start;
  let checked = 0;
  for (const e of entries) {
    if (e.seq !== last.seq + 1) return { ok: false, checked, brokenAtSeq: e.seq, problem: "gap", last };
    if (e.prevHash !== last.hash) return { ok: false, checked, brokenAtSeq: e.seq, problem: "link", last };
    if (auditHash(e.prevHash, e) !== e.hash)
      return { ok: false, checked, brokenAtSeq: e.seq, problem: "hash", last };
    last = { seq: e.seq, hash: e.hash };
    checked++;
  }
  return { ok: true, checked, last };
}

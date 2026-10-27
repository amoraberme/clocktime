import { describe, expect, it } from "vitest";
import { auditHash, canonicalJson, verifyChain, type ChainEntry } from "@/lib/audit-chain";
import { parseCsvDate, parseCsvTime } from "@/server/services/schedule-import";
import { signPayload, validateWebhookUrl } from "@/server/services/webhooks";
import { createHmac } from "node:crypto";

function chain(n: number) {
  const out: (ChainEntry & { hash: string; prevHash: string | null })[] = [];
  let prev: string | null = null;
  for (let i = 1; i <= n; i++) {
    const e: ChainEntry = {
      seq: i,
      companyId: "c1",
      actorUserId: "u1",
      actorLabel: "Ana",
      action: "leave.approve",
      entityType: "LeaveRequest",
      entityId: `r${i}`,
      before: null,
      after: { days: i, nested: { b: 1, a: 2 } },
      reason: null,
      ip: "203.0.113.5",
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)),
    };
    const hash = auditHash(prev, e);
    out.push({ ...e, hash, prevHash: prev });
    prev = hash;
  }
  return out;
}

describe("audit hash chain", () => {
  it("canonicalizes key order so jsonb round-trips verify", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe('{"a":[{"c":2,"d":1}],"b":1}');
  });

  it("verifies an intact chain and pinpoints tampering", () => {
    const c = chain(5);
    expect(verifyChain(c).ok).toBe(true);
    const edited = c.map((e) => (e.seq === 3 ? { ...e, after: { days: 99 } } : e));
    expect(verifyChain(edited)).toMatchObject({ ok: false, brokenAtSeq: 3, problem: "hash" });
    const deleted = c.filter((e) => e.seq !== 2);
    expect(verifyChain(deleted)).toMatchObject({ ok: false, brokenAtSeq: 3, problem: "gap" });
    // Continue from a previous batch
    const first = verifyChain(c.slice(0, 2));
    expect(verifyChain(c.slice(2), first.last).ok).toBe(true);
  });
});

describe("webhooks", () => {
  it("signs t.body with HMAC-SHA256", () => {
    const sig = signPayload("whsec_x", '{"a":1}', 1700000000);
    const expected = createHmac("sha256", "whsec_x").update('1700000000.{"a":1}').digest("hex");
    expect(sig).toBe(`t=1700000000,v1=${expected}`);
  });

  it("only accepts public https URLs", () => {
    expect(validateWebhookUrl("https://payroll.example.com/hook")).toBe("https://payroll.example.com/hook");
    expect(() => validateWebhookUrl("http://payroll.example.com/hook")).toThrow(/https/);
    expect(() => validateWebhookUrl("https://10.0.0.5/hook")).toThrow(/public/);
    expect(() => validateWebhookUrl("https://[::ffff:192.168.1.1]/hook")).toThrow(/public/);
    expect(() => validateWebhookUrl("https://user:pw@example.com/")).toThrow(/credentials/);
    expect(() => validateWebhookUrl("not a url")).toThrow();
  });
});

describe("schedule CSV parsing", () => {
  it("reads common date formats", () => {
    expect(parseCsvDate("2026-11-02")).toBe("2026-11-02");
    expect(parseCsvDate("11/2/2026")).toBe("2026-11-02");
    expect(parseCsvDate("25/12/2026")).toBe("2026-12-25");
    expect(parseCsvDate("2026-02-30")).toBeNull();
  });

  it("reads 24-hour and AM/PM times", () => {
    expect(parseCsvTime("07:00")).toBe(420);
    expect(parseCsvTime("7:30 PM")).toBe(19 * 60 + 30);
    expect(parseCsvTime("12:00 AM")).toBe(0);
    expect(parseCsvTime("1900")).toBe(1140);
    expect(parseCsvTime("25:00")).toBeNull();
  });
});

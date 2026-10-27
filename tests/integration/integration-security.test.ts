import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PUT as upsertEmployee } from "@/app/api/v1/employees/[employeeNo]/route";
import { addDays, dateKey } from "@/lib/time";
import { createApiKey } from "@/server/api-auth";
import { verifyAuditChain, writeAudit } from "@/server/audit";
import { prisma } from "@/server/db";
import { importSchedule } from "@/server/services/schedule-import";
import { addEmployee } from "@/server/services/team";
import { createWebhook, deliverPending, emitEvent } from "@/server/services/webhooks";
import { cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));

// A local receiver for webhook deliveries.
let server: Server;
let url = "";
let status = 200;
const received: { headers: IncomingMessage["headers"]; body: string }[] = [];
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.statusCode = status;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://localhost:${(server.address() as AddressInfo).port}/hook`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("webhooks", () => {
  it("delivers signed events and retries failures with backoff", async () => {
    const t = await makeCompany({ plan: "ENTERPRISE" });
    created.push(t.company.id);
    const { secret, row } = await createWebhook(t.ctx, { url, events: ["employee.updated"] });
    expect(secret).toMatch(/^whsec_/);
    expect(row.secretEnc).not.toContain(secret);

    await emitEvent(t.company.id, "employee.updated", { employeeId: "e1" });
    await emitEvent(t.company.id, "punch.created", { punchId: "p1" }); // not subscribed
    expect(await prisma.webhookDelivery.count({ where: { endpointId: row.id } })).toBe(1);
    received.length = 0;
    await deliverPending();
    expect(received).toHaveLength(1);
    const { headers, body } = received[0]!;
    const [, ts, v1] = /^t=(\d+),v1=([0-9a-f]+)$/.exec(String(headers["x-clocktime-signature"]))!;
    expect(createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")).toBe(v1);
    expect(JSON.parse(body)).toMatchObject({ event: "employee.updated", data: { employeeId: "e1" } });

    status = 500;
    await emitEvent(t.company.id, "employee.updated", { employeeId: "e2" });
    await deliverPending();
    const failed = await prisma.webhookDelivery.findFirst({
      where: { endpointId: row.id, status: "PENDING" },
    });
    expect(failed).toMatchObject({ attempts: 1, lastError: "HTTP 500" });
    expect(failed!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    status = 200;
  });

  it("emits employee.updated when the team changes", async () => {
    const t = await makeCompany({ plan: "ENTERPRISE" });
    created.push(t.company.id);
    const { row } = await createWebhook(t.ctx, { url, events: ["employee.updated"] });
    await addEmployee(t.ctx, { firstName: "Webhook", lastName: "Person", rate: 600 });
    const d = await prisma.webhookDelivery.findFirst({ where: { endpointId: row.id } });
    expect(d?.payload).toMatchObject({ data: { firstName: "Webhook", status: "ACTIVE" } });
  });
});

describe("audit hash chain", () => {
  it("numbers entries per company and detects tampering", async () => {
    const t = await makeCompany({ plan: "ENTERPRISE" });
    created.push(t.company.id);
    const actor = { companyId: t.company.id, userId: t.user.id, label: "Tester" };
    for (let i = 0; i < 3; i++)
      await writeAudit(actor, { action: "test.write", entityType: "Test", after: { i, z: { b: 1, a: 2 } } });
    const ok = await verifyAuditChain(t.company.id);
    expect(ok.ok).toBe(true);
    expect(ok.checked).toBeGreaterThanOrEqual(3);

    const target = await prisma.auditLog.findFirst({
      where: { companyId: t.company.id, action: "test.write" },
      orderBy: { seq: "asc" },
    });
    await prisma.auditLog.update({ where: { id: target!.id }, data: { after: { i: 99 } } });
    expect(await verifyAuditChain(t.company.id)).toMatchObject({
      ok: false,
      brokenAtSeq: target!.seq,
      problem: "hash",
    });
  });
});

describe("schedule import", () => {
  it("validates, imports overnight and 24h duties, and replaces days on re-import", async () => {
    const t = await makeCompany({ plan: "ENTERPRISE" });
    created.push(t.company.id);
    await prisma.location.update({ where: { id: t.location!.id }, data: { code: "MNL" } });
    await prisma.company.update({
      where: { id: t.company.id },
      data: { settings: { maxShiftHours: 24 } },
    });
    const ctx = { ...t.ctx, settings: { ...t.ctx.settings, maxShiftHours: 24 } };
    await addEmployee(ctx, {
      firstName: "Guard",
      rate: 700,
      employeeNo: "G1",
      locationIds: [t.location!.id],
    });
    const d1 = addDays(dateKey(new Date(), "Asia/Manila"), 10);
    const d2 = addDays(d1, 1);

    const bad = await importSchedule(
      ctx,
      [
        { employee_no: "G1", date: d1, start: "07:00", end: "07:00", branch: "MNL" },
        { employee_no: "NOPE", date: d1, start: "08:00", end: "17:00" },
      ],
      { dryRun: false, publish: false },
    );
    expect(bad.imported).toBe(false);
    expect(bad.results[1]).toMatchObject({ ok: false });
    expect(await prisma.shift.count({ where: { companyId: t.company.id } })).toBe(0);

    const ok = await importSchedule(
      ctx,
      [
        { employee_no: "G1", date: d1, start: "07:00", end: "07:00", branch: "MNL" },
        { "Employee No": "g1", Date: d2, Start: "10:00 PM", End: "6:00 AM" },
      ],
      { dryRun: false, publish: true },
    );
    expect(ok).toMatchObject({ imported: true, created: 2, cleared: 0 });
    const shifts = await prisma.shift.findMany({
      where: { companyId: t.company.id },
      orderBy: { startAt: "asc" },
    });
    expect(shifts.map((s) => (s.endAt.getTime() - s.startAt.getTime()) / 3600_000)).toEqual([24, 8]);
    expect(shifts.every((s) => s.status === "PUBLISHED")).toBe(true);

    const again = await importSchedule(ctx, [{ employee_no: "G1", date: d2, start: "OFF" }], {
      dryRun: false,
      publish: true,
    });
    expect(again).toMatchObject({ created: 0, cleared: 1 });
    expect(await prisma.shift.count({ where: { companyId: t.company.id } })).toBe(1);
  });
});

describe("employee upsert API", () => {
  it("creates, updates and archives by employee number", async () => {
    const t = await makeCompany({ plan: "ENTERPRISE" });
    created.push(t.company.id);
    await prisma.location.update({ where: { id: t.location!.id }, data: { code: "CEB" } });
    const { key } = await createApiKey(t.company.id, "hris", ["write"], t.owner.id);
    const put = (b: unknown) =>
      upsertEmployee(
        new Request("http://test/api/v1/employees/H-77", {
          method: "PUT",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify(b),
        }),
        { params: Promise.resolve({ employeeNo: "H-77" }) },
      );
    const r1 = await put({ firstName: "Hris", lastName: "Sync", rate: 650, branches: ["ceb"] });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ created: true, employeeNo: "H-77" });
    const r2 = await put({ rate: 700 });
    expect(await r2.json()).toMatchObject({ created: false });
    const emp = await prisma.employee.findFirst({
      where: { companyId: t.company.id, employeeNo: "H-77" },
      include: { locations: true },
    });
    expect(emp).toMatchObject({ firstName: "Hris", rateCentavos: 70000 });
    expect(emp!.locations.map((l) => l.locationId)).toEqual([t.location!.id]);
    expect((await put({ branches: ["XXX"] })).status).toBe(422);
    expect(await (await put({ archived: true })).json()).toMatchObject({ status: "ARCHIVED" });
  });
});

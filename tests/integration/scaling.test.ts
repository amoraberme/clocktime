import { afterAll, describe, expect, it } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { prisma } from "@/server/db";
import { cleanup as nightly } from "@/server/services/jobs";
import { addEmployee } from "@/server/services/team";
import { employeeLookup, terminalBySerial, touchTerminal } from "@/server/services/terminals";
import { cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));

describe("production readiness", () => {
  it("reports health", async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", checks: { database: "ok", config: "ok" } });
  });

  it("looks up only the terminal IDs in an upload, falling back for padded employee numbers", async () => {
    const t = await makeCompany({ plan: "ENTERPRISE" });
    created.push(t.company.id);
    const a = await addEmployee(t.ctx, { firstName: "Ana", rate: 600, deviceUserId: "0042" });
    const b = await addEmployee(t.ctx, { firstName: "Ben", rate: 600, employeeNo: "0007" });
    const find = await employeeLookup(t.company.id, ["42", "7"]);
    expect(find("42")?.id).toBe(a.id);
    expect(find("0007")?.id).toBe(b.id);
    expect(find("999")).toBeNull();
  });

  it("writes a terminal's last-seen time at most once a minute", async () => {
    const t = await makeCompany({ plan: "ENTERPRISE" });
    created.push(t.company.id);
    const serial = `TESTSNT${Date.now()}`;
    await prisma.attendanceDevice.create({
      data: { companyId: t.company.id, name: "Gate", serialNumber: serial, pushVersion: "2.4.1" },
    });
    await touchTerminal((await terminalBySerial(serial))!, "203.0.113.9", { pushVersion: "2.4.1" });
    const first = (await terminalBySerial(serial))!;
    await touchTerminal(first, "203.0.113.9", { pushVersion: "2.4.1" });
    expect((await terminalBySerial(serial))!.lastSeenAt!.getTime()).toBe(first.lastSeenAt!.getTime());
    await touchTerminal(first, "203.0.113.10");
    expect((await terminalBySerial(serial))!.lastIp).toBe("203.0.113.10");
  });

  it("purges expired sessions and auth rate-limit rows nightly", async () => {
    const t = await makeCompany();
    created.push(t.company.id);
    const old = new Date(Date.now() - 86_400_000);
    await prisma.session.create({
      data: { id: `s-${Date.now()}`, token: `tok-${Date.now()}`, userId: t.user.id, expiresAt: old },
    });
    await prisma.authRateLimit.create({
      data: {
        id: `rl-${Date.now()}`,
        key: `k-${Date.now()}`,
        count: 3,
        lastRequest: BigInt(old.getTime() - 1000),
      },
    });
    await nightly();
    expect(await prisma.session.count({ where: { userId: t.user.id, expiresAt: { lt: new Date() } } })).toBe(
      0,
    );
    expect(await prisma.authRateLimit.count({ where: { lastRequest: { lt: BigInt(old.getTime()) } } })).toBe(
      0,
    );
  });
});

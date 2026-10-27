import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { GET as employees } from "@/app/api/v1/employees/route";
import { POST as punches } from "@/app/api/v1/punches/route";
import { createApiKey } from "@/server/api-auth";
import { prisma } from "@/server/db";
import { addEmployee } from "@/server/services/team";
import { cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));

const req = (url: string, key: string, init: RequestInit = {}) =>
  new Request(`http://test${url}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
const noParams = { params: Promise.resolve({}) };

describe("REST API", () => {
  it("authenticates, scopes and isolates by company", async () => {
    const a = await makeCompany({ plan: "PRO" });
    const b = await makeCompany({ plan: "PRO" });
    created.push(a.company.id, b.company.id);
    const emp = await addEmployee(a.ctx, {
      firstName: "Api",
      lastName: "User",
      payType: "DAILY",
      rate: 700,
      employeeNo: "A100",
    });
    await addEmployee(b.ctx, { firstName: "Other", lastName: "Co", payType: "DAILY", rate: 700 });
    const { key: readKey } = await createApiKey(a.company.id, "read", ["read"], a.owner.id);
    const { key: punchKey } = await createApiKey(a.company.id, "punch", ["punch"], a.owner.id);

    expect((await employees(req("/api/v1/employees", "nope"), noParams)).status).toBe(401);
    const list = await (await employees(req("/api/v1/employees", readKey), noParams)).json();
    expect(list.data.map((e: { lastName: string }) => e.lastName).sort()).toEqual(
      ["User", a.owner.lastName].sort(),
    );

    expect(
      (await punches(req("/api/v1/punches", readKey, { method: "POST", body: "{}" }), noParams)).status,
    ).toBe(403);
    const clientId = randomUUID();
    const body = JSON.stringify({ employeeNo: "A100", action: "CLOCK_IN", clientId });
    const r1 = await punches(req("/api/v1/punches", punchKey, { method: "POST", body }), noParams);
    expect(r1.status).toBe(200);
    const r2 = await punches(req("/api/v1/punches", punchKey, { method: "POST", body }), noParams);
    expect(r2.status).toBe(200);
    expect(await prisma.timeEntry.count({ where: { employeeId: emp.id } })).toBe(1);

    await prisma.company.update({ where: { id: a.company.id }, data: { plan: "STARTER" } });
    expect((await employees(req("/api/v1/employees", readKey), noParams)).status).toBe(403);
  });
});

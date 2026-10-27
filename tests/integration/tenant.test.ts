import { afterAll, describe, expect, it } from "vitest";
import { addEmployee } from "@/server/services/team";
import { tenantDb } from "@/server/tenant";
import { cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));

describe("tenant isolation", () => {
  it("never returns or modifies another company's rows", async () => {
    const a = await makeCompany();
    const b = await makeCompany();
    created.push(a.company.id, b.company.id);
    const bEmp = await addEmployee(b.ctx, { firstName: "Bea", lastName: "B", payType: "DAILY", rate: 600 });

    const dbA = tenantDb(a.company.id);
    expect(await dbA.employee.findUnique({ where: { id: bEmp.id } })).toBeNull();
    expect((await dbA.employee.findMany()).every((e) => e.companyId === a.company.id)).toBe(true);
    expect(await dbA.employee.count({ where: { id: bEmp.id } })).toBe(0);
    const res = await dbA.employee.updateMany({ where: { id: bEmp.id }, data: { firstName: "Hacked" } });
    expect(res.count).toBe(0);
    await expect(
      dbA.employee.update({ where: { id: bEmp.id }, data: { firstName: "Hacked" } }),
    ).rejects.toThrow();
    await expect(dbA.employee.delete({ where: { id: bEmp.id } })).rejects.toThrow();

    // Creates are forced into the caller's company, even if another companyId is passed.
    const loc = await dbA.location.create({ data: { companyId: b.company.id, name: "Sneaky" } });
    expect(loc.companyId).toBe(a.company.id);
  });
});

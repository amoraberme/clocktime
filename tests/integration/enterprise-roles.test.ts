import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { decideLeave } from "@/server/services/leave";
import { addEmployee, updateEmployee } from "@/server/services/team";
import { asMember, cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));

async function setup(plan: "PRO" | "ENTERPRISE" = "ENTERPRISE") {
  const t = await makeCompany({ plan });
  created.push(t.company.id);
  const ops = await addEmployee(t.ctx, { firstName: "Olga", departmentName: "Operations", rate: 700 });
  const sales = await addEmployee(t.ctx, { firstName: "Sam", departmentName: "Sales", rate: 700 });
  const type = await prisma.leaveType.create({
    data: { companyId: t.company.id, name: "Vacation", code: "VL-T", annualDays: 5 },
  });
  const leaveFor = (employeeId: string) =>
    prisma.leaveRequest.create({
      data: {
        companyId: t.company.id,
        employeeId,
        leaveTypeId: type.id,
        startDate: new Date("2026-12-01T00:00:00Z"),
        endDate: new Date("2026-12-01T00:00:00Z"),
        days: 1,
      },
    });
  return { ...t, ops, sales, leaveFor };
}

describe("enterprise roles and scope", () => {
  it("keeps timekeepers out of leave approvals", async () => {
    const t = await setup();
    const tk = await addEmployee(t.ctx, { firstName: "Tina", role: "TIMEKEEPER", rate: 700 });
    const req = await t.leaveFor(t.ops.id);
    await expect(decideLeave(asMember(t.ctx, tk, "TIMEKEEPER"), req.id, true)).rejects.toThrow(
      /can't approve/,
    );
  });

  it("limits a supervisor to the departments they manage", async () => {
    const t = await setup();
    const sup = await addEmployee(t.ctx, {
      firstName: "Sol",
      role: "MANAGER",
      rate: 700,
      managedDepartmentNames: ["Operations"],
    });
    const depts = await prisma.employeeDepartment.findMany({ where: { employeeId: sup.id } });
    expect(depts).toHaveLength(1);
    const ctx = asMember(t.ctx, sup, "MANAGER", { departmentIds: depts.map((d) => d.departmentId) });
    await expect(decideLeave(ctx, (await t.leaveFor(t.sales.id)).id, true)).rejects.toThrow(/branches/);
    await expect(decideLeave(ctx, (await t.leaveFor(t.ops.id)).id, true)).resolves.toBeUndefined();
  });

  it("reserves HR and timekeeper roles for Enterprise", async () => {
    const t = await setup("PRO");
    await expect(addEmployee(t.ctx, { firstName: "Hana", role: "HR", rate: 700 })).rejects.toThrow(
      /Enterprise/,
    );
  });

  it("keeps terminal IDs and RFID cards unique and normalized", async () => {
    const t = await setup();
    const a = await addEmployee(t.ctx, { firstName: "Ana", deviceUserId: "0042", cardNumber: "0001234567" });
    expect(a.deviceUserId).toBe("42");
    expect(a.cardLookup).toBeTruthy();
    await expect(addEmployee(t.ctx, { firstName: "Ben", deviceUserId: "42" })).rejects.toThrow(
      /already used/,
    );
    await expect(addEmployee(t.ctx, { firstName: "Cy", cardNumber: "1234567" })).rejects.toThrow(
      /already assigned/,
    );
    const updated = await updateEmployee(t.ctx, a.id, {
      firstName: "Ana",
      deviceUserId: "42",
      clearCard: true,
    });
    expect(updated.cardLookup).toBeNull();
  });
});

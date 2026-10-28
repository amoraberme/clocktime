import { afterAll, describe, expect, it, vi } from "vitest";

// The email service rejects everything (e.g. Resend before the sender domain is verified).
vi.mock("@/server/email", async (original) => ({
  ...(await original<typeof import("@/server/email")>()),
  sendEmail: vi.fn().mockRejectedValue(new Error('Resend error 403: {"message":"domain is not verified"}')),
}));

const { prisma } = await import("@/server/db");
const { run } = await import("@/server/action");
const { addEmployee, updateEmployee, sendInvitation } = await import("@/server/services/team");
const { cleanup, makeCompany } = await import("./helpers");

const created: string[] = [];
afterAll(() => cleanup(created));

describe("adding people when things go wrong", () => {
  it("still adds the person when the invite email fails, with a clear warning", async () => {
    const t = await makeCompany({ plan: "PRO" });
    created.push(t.company.id);
    const emp = await addEmployee(t.ctx, {
      firstName: "Ana",
      lastName: "Cruz",
      rate: 650,
      email: "ana@example.ph",
    });
    expect(await prisma.employee.count({ where: { id: emp.id } })).toBe(1);
    expect(emp.inviteError).toMatch(/couldn't be sent.*refused the sender/);
    await expect(sendInvitation(t.ctx, emp.id)).rejects.toThrow(/Resend invite/);
  });

  it("explains a duplicate employee number instead of 'Something went wrong'", async () => {
    const t = await makeCompany({ plan: "PRO" });
    created.push(t.company.id);
    const a = await addEmployee(t.ctx, { firstName: "Ben", rate: 650, employeeNo: "E-100" });
    await expect(addEmployee(t.ctx, { firstName: "Cy", rate: 650, employeeNo: "E-100" })).rejects.toThrow(
      /E-100 is already used by Ben/,
    );
    const b = await addEmployee(t.ctx, { firstName: "Dee", rate: 650 });
    await expect(
      updateEmployee(t.ctx, b.id, { firstName: "Dee", rate: 650, employeeNo: "E-100" }),
    ).rejects.toThrow(/already used by Ben/);
    expect(a.employeeNo).toBe("E-100");
  });

  it("turns any remaining unique-constraint error into a readable message", async () => {
    const t = await makeCompany({ plan: "PRO" });
    created.push(t.company.id);
    const r = await run(() =>
      prisma.employee.createMany({
        data: [1, 2].map((i) => ({
          companyId: t.company.id,
          firstName: `P${i}`,
          lastName: "",
          employeeNo: "DUP",
          rateCentavos: 1,
        })),
      }),
    );
    expect(r).toMatchObject({
      ok: false,
      error: "That employee number is already in use. Use a different one.",
    });
  });
});

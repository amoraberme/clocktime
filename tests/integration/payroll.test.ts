import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  computePayRun,
  createPayRun,
  createYearEndRun,
  finalizePayRun,
  addRunAdjustment,
} from "@/server/services/payroll";
import { addEmployee } from "@/server/services/team";
import { editTimeEntry } from "@/server/services/timesheet-edits";
import { storage } from "@/server/storage";
import { atMinute, eachDay, weekday } from "@/lib/time";
import { cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));
const TZ = "Asia/Manila";

describe("payroll run", () => {
  it("computes, finalizes, locks time and generates payslips", async () => {
    const t = await makeCompany({ plan: "PRO" });
    created.push(t.company.id);
    const emp = await addEmployee(t.ctx, {
      firstName: "Rico",
      lastName: "R",
      payType: "DAILY",
      rate: 800,
      restDays: [0],
      hireDate: "2024-01-01",
      sss: "34-1234567-8",
      tin: "123-456-789",
      philhealth: "12-345678901-2",
      pagibig: "1234-5678-9012",
    });
    await prisma.loan.create({
      data: {
        companyId: t.company.id,
        employeeId: emp.id,
        label: "Cash advance",
        principalCentavos: 100000,
        amortizationCentavos: 50000,
        balanceCentavos: 100000,
        startDate: new Date("2026-09-01"),
      },
    });
    // Sept 1–15, 2026: work every non-Sunday 08:00–17:00 with a lunch break.
    const days = eachDay("2026-09-01", "2026-09-15").filter((d) => weekday(d) !== 0);
    for (const d of days) {
      await prisma.timeEntry.create({
        data: {
          companyId: t.company.id,
          employeeId: emp.id,
          clockInAt: atMinute(d, 8 * 60, TZ),
          clockOutAt: atMinute(d, 17 * 60, TZ),
          inSource: "MOBILE",
          status: "CLOSED",
          breaks: { create: [{ startAt: atMinute(d, 12 * 60, TZ), endAt: atMinute(d, 13 * 60, TZ) }] },
        },
      });
    }
    const run = await createPayRun(t.ctx, "2026-09-10");
    expect(run.cutoffIndex).toBe(1);
    const item = await prisma.payRunItem.findFirstOrThrow({
      where: { payRunId: run.id, employeeId: emp.id },
    });
    expect(item.grossCentavos).toBe(days.length * 80000);
    expect(item.basicCentavos).toBe(days.length * 80000);
    expect(item.sssEe).toBeGreaterThan(0);
    expect(item.philhealthEe).toBeGreaterThan(0);
    expect(item.pagibigEe).toBe(10000); // half of ₱200
    const loan = (item.deductions as { code: string; amount: number }[]).find((d) => d.code === "LOAN");
    expect(loan?.amount).toBe(50000);
    expect(item.netCentavos).toBe(
      item.grossCentavos - item.sssEe - item.philhealthEe - item.pagibigEe - item.withholdingTax - 50000,
    );

    await addRunAdjustment(t.ctx, run.id, {
      employeeId: emp.id,
      kind: "ALLOWANCE",
      label: "Rice subsidy",
      amount: 100000,
      taxable: false,
      recurring: false,
    });
    const withAllowance = await prisma.payRunItem.findFirstOrThrow({
      where: { payRunId: run.id, employeeId: emp.id },
    });
    expect(withAllowance.grossCentavos).toBe(item.grossCentavos + 100000);

    await finalizePayRun(t.ctx, run.id);
    const after = await prisma.payRun.findUniqueOrThrow({ where: { id: run.id }, include: { items: true } });
    expect(after.status).toBe("FINALIZED");
    const pdfKey = after.items.find((i) => i.employeeId === emp.id)!.payslipKey!;
    const pdf = await storage().get(pdfKey);
    expect(pdf?.subarray(0, 4).toString()).toBe("%PDF");
    expect((await prisma.loan.findFirstOrThrow({ where: { employeeId: emp.id } })).balanceCentavos).toBe(
      50000,
    );
    const locked = await prisma.timeEntry.findFirstOrThrow({ where: { employeeId: emp.id } });
    expect(locked.status).toBe("LOCKED");
    await expect(
      editTimeEntry(t.ctx, locked.id, {
        clockIn: "2026-09-01T07:00",
        clockOut: "2026-09-01T17:00",
        reason: "test edit",
      }),
    ).rejects.toThrow(/locked/);
    await expect(computePayRun(t.ctx, run.id)).rejects.toThrow(/finalized/);

    // 2nd cut-off trues up the month's contributions.
    for (const d of eachDay("2026-09-16", "2026-09-30").filter((x) => weekday(x) !== 0)) {
      await prisma.timeEntry.create({
        data: {
          companyId: t.company.id,
          employeeId: emp.id,
          clockInAt: atMinute(d, 8 * 60, TZ),
          clockOutAt: atMinute(d, 17 * 60, TZ),
          inSource: "MOBILE",
          status: "CLOSED",
          breaks: { create: [{ startAt: atMinute(d, 12 * 60, TZ), endAt: atMinute(d, 13 * 60, TZ) }] },
        },
      });
    }
    const run2 = await createPayRun(t.ctx, "2026-09-20");
    const item2 = await prisma.payRunItem.findFirstOrThrow({
      where: { payRunId: run2.id, employeeId: emp.id },
    });
    expect(item.pagibigEe + item2.pagibigEe).toBe(20000);
    await finalizePayRun(t.ctx, run2.id);

    const ye = await createYearEndRun(t.ctx, 2026, "2026-12-15");
    const yeItem = await prisma.payRunItem.findFirstOrThrow({
      where: { payRunId: ye.id, employeeId: emp.id },
    });
    const thirteenth = (yeItem.earnings as { code: string; amount: number }[]).find(
      (e) => e.code === "THIRTEENTH",
    )!;
    expect(thirteenth.amount).toBe(Math.round((item.basicCentavos + item2.basicCentavos) / 12));
    expect((yeItem.earnings as { code: string }[]).some((e) => e.code === "SIL_CASH")).toBe(true);
  });
});

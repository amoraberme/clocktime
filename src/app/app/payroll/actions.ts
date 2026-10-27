"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pesosToCentavos } from "@/lib/money";
import { run, UserError } from "@/server/action";
import { actorFrom, writeAudit } from "@/server/audit";
import { getContextOrThrow, requireFeature } from "@/server/context";
import {
  addRunAdjustment,
  computePayRun,
  createPayRun,
  createYearEndRun,
  deletePayRun,
  finalizePayRun,
  markPaid,
  removeAdjustment,
} from "@/server/services/payroll";

const refresh = () => revalidatePath("/app/payroll", "layout");

export async function createRunAction(date: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("HR");
    const r = await createPayRun(ctx, z.iso.date().parse(date));
    refresh();
    return r.id;
  });
}

export async function createYearEndAction(year: number, payDate: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("HR");
    const r = await createYearEndRun(ctx, year, z.iso.date().parse(payDate));
    refresh();
    return r.id;
  });
}

export async function recomputeAction(id: string) {
  return run(async () => {
    await computePayRun(await getContextOrThrow("HR"), id);
    refresh();
  }, "Recalculated with the latest timesheets.");
}

export async function finalizeAction(id: string) {
  return run(async () => {
    await finalizePayRun(await getContextOrThrow("HR"), id);
    refresh();
  }, "Payroll finalized. Timesheets are locked and payslips are ready.");
}

export async function markPaidAction(id: string, email: boolean) {
  return run(
    async () => {
      await markPaid(await getContextOrThrow("HR"), id, email);
      refresh();
    },
    email ? "Marked paid and payslips emailed." : "Marked paid. Staff can see their payslips in the app.",
  );
}

export async function deleteRunAction(id: string) {
  return run(async () => {
    await deletePayRun(await getContextOrThrow("HR"), id);
    refresh();
  }, "Draft deleted.");
}

const adjSchema = z.object({
  employeeId: z.string().min(1),
  kind: z.enum(["ALLOWANCE", "BONUS", "DEDUCTION", "REIMBURSEMENT"]),
  label: z.string().trim().min(2).max(80),
  amount: z.coerce.number().positive("Enter an amount"),
  taxable: z.boolean(),
  recurring: z.boolean(),
});

export async function addAdjustmentAction(runId: string, data: unknown) {
  return run(async () => {
    const ctx = await getContextOrThrow("HR");
    const a = adjSchema.parse(data);
    await addRunAdjustment(ctx, runId, { ...a, amount: pesosToCentavos(a.amount) });
    refresh();
  }, "Adjustment added.");
}

export async function removeAdjustmentAction(id: string, runId: string) {
  return run(async () => {
    await removeAdjustment(await getContextOrThrow("HR"), id, runId);
    refresh();
  }, "Adjustment removed.");
}

const loanSchema = z.object({
  employeeId: z.string().min(1),
  label: z.string().trim().min(2).max(80),
  principal: z.coerce.number().positive(),
  amortization: z.coerce.number().positive(),
  startDate: z.iso.date(),
});

export async function createLoanAction(data: unknown) {
  return run(async () => {
    const ctx = await getContextOrThrow("HR");
    requireFeature(ctx, "payroll");
    const l = loanSchema.parse(data);
    if (l.amortization > l.principal)
      throw new UserError("The per-payday deduction can't exceed the loan amount.");
    if (!(await ctx.db.employee.findUnique({ where: { id: l.employeeId } })))
      throw new UserError("Employee not found.");
    const loan = await ctx.db.loan.create({
      data: {
        companyId: ctx.company.id,
        employeeId: l.employeeId,
        label: l.label,
        principalCentavos: pesosToCentavos(l.principal),
        amortizationCentavos: pesosToCentavos(l.amortization),
        balanceCentavos: pesosToCentavos(l.principal),
        startDate: new Date(`${l.startDate}T00:00:00Z`),
      },
    });
    await writeAudit(actorFrom(ctx), {
      action: "loan.create",
      entityType: "Loan",
      entityId: loan.id,
      after: l,
    });
    refresh();
  }, "Loan added. It will be deducted every payday.");
}

export async function cancelLoanAction(id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("HR");
    await ctx.db.loan.update({ where: { id }, data: { status: "CANCELED" } });
    await writeAudit(actorFrom(ctx), { action: "loan.cancel", entityType: "Loan", entityId: id });
    refresh();
  }, "Loan canceled.");
}

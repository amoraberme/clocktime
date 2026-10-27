import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { dailyRate } from "@/lib/pay/gross";
import {
  computePayslip,
  monthlyBasicFromRate,
  thirteenthMonth,
  ZERO_CONTRIBUTIONS,
  type Contributions,
  type StatutoryTables,
} from "@/lib/pay/payroll";
import {
  OTHER_BENEFITS_EXEMPTION,
  PAGIBIG_2024,
  PHILHEALTH_2025,
  SSS_2025,
  WITHHOLDING_2023,
} from "@/lib/pay/statutory";
import { dateKey, keyToUtcDate, lastDayOfMonth, pad, payPeriodFor, utcDateToKey } from "@/lib/time";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import { requireFeature, type AppContext } from "../context";
import { prisma } from "../db";
import { escapeHtml, layout, sendEmail } from "../email";
import { leaveBalances } from "./leave";
import { notify } from "./notifications";
import { renderPayslipPdf } from "../payslip-pdf";
import { storage } from "../storage";
import { computeEmployeePeriod, loadEntries, loadPayInputs, periodBounds } from "./timesheets";

/** Statutory tables in effect on a date (falls back to built-ins). */
export async function loadStatutoryTables(
  onDate: Date,
): Promise<{ tables: StatutoryTables; versions: Record<string, string> }> {
  const kinds = ["SSS", "PHILHEALTH", "PAGIBIG", "WITHHOLDING_TAX"] as const;
  const rows = await Promise.all(
    kinds.map((kind) =>
      prisma.statutoryTable.findFirst({
        where: { kind, effectiveFrom: { lte: onDate } },
        orderBy: { effectiveFrom: "desc" },
      }),
    ),
  );
  const [sss, ph, pi, wt] = rows;
  return {
    tables: {
      sss: (sss?.data as unknown as StatutoryTables["sss"]) ?? SSS_2025,
      philhealth: (ph?.data as unknown as StatutoryTables["philhealth"]) ?? PHILHEALTH_2025,
      pagibig: (pi?.data as unknown as StatutoryTables["pagibig"]) ?? PAGIBIG_2024,
      withholding: (wt?.data as unknown as StatutoryTables["withholding"]) ?? WITHHOLDING_2023,
    },
    versions: {
      sss: sss?.version ?? "built-in",
      philhealth: ph?.version ?? "built-in",
      pagibig: pi?.version ?? "built-in",
      withholding: wt?.version ?? "built-in",
    },
  };
}

function periodOpts(ctx: AppContext) {
  return { weekStartsOn: ctx.settings.weekStartsOn, payDateOffsetDays: ctx.settings.payDateOffsetDays };
}

export async function createPayRun(ctx: AppContext, anyDateInPeriod: string) {
  requireFeature(ctx, "payroll");
  const period = payPeriodFor(anyDateInPeriod, ctx.company.payFrequency, periodOpts(ctx));
  const existing = await ctx.db.payRun.findFirst({
    where: { kind: "REGULAR", periodStart: keyToUtcDate(period.start) },
  });
  if (existing) return existing;
  const run = await ctx.db.payRun.create({
    data: {
      companyId: ctx.company.id,
      kind: "REGULAR",
      periodStart: keyToUtcDate(period.start),
      periodEnd: keyToUtcDate(period.end),
      payDate: keyToUtcDate(period.payDate),
      cutoffIndex: period.cutoffIndex,
      createdById: ctx.employee.id,
    },
  });
  await writeAudit(actorFrom(ctx), {
    action: "payroll.create",
    entityType: "PayRun",
    entityId: run.id,
    after: period,
  });
  await computePayRun(ctx, run.id);
  return run;
}

/** Earlier finalized runs in the same calendar month, per employee (for contribution true-ups). */
async function monthToDate(ctx: AppContext, runId: string, periodEnd: string) {
  const [y, m] = periodEnd.split("-").map(Number) as [number, number];
  const from = keyToUtcDate(`${y}-${pad(m)}-01`);
  const to = keyToUtcDate(`${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`);
  const items = await ctx.db.payRunItem.findMany({
    where: {
      payRunId: { not: runId },
      payRun: { kind: "REGULAR", status: { in: ["FINALIZED", "PAID"] }, periodEnd: { gte: from, lte: to } },
    },
  });
  const map = new Map<string, { gross: number; c: Contributions }>();
  for (const i of items) {
    const cur = map.get(i.employeeId) ?? { gross: 0, c: { ...ZERO_CONTRIBUTIONS } };
    cur.gross += i.grossCentavos;
    cur.c.sssEe += i.sssEe;
    cur.c.sssEr += i.sssEr;
    cur.c.sssEc += i.sssEc;
    cur.c.philhealthEe += i.philhealthEe;
    cur.c.philhealthEr += i.philhealthEr;
    cur.c.pagibigEe += i.pagibigEe;
    cur.c.pagibigEr += i.pagibigEr;
    map.set(i.employeeId, cur);
  }
  return map;
}

function json(v: unknown) {
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

export async function computePayRun(ctx: AppContext, runId: string) {
  requireFeature(ctx, "payroll");
  const run = await ctx.db.payRun.findUnique({ where: { id: runId } });
  if (!run) throw new UserError("Pay run not found.");
  if (run.status !== "DRAFT" && run.status !== "COMPUTED")
    throw new UserError("This pay run is finalized and can't be recalculated.");
  if (run.kind !== "REGULAR") return computeYearEndRun(ctx, run.id);
  const period = { start: utcDateToKey(run.periodStart), end: utcDateToKey(run.periodEnd) };
  const bounds = { gte: new Date(`${period.start}T00:00:00Z`), lte: new Date(`${period.end}T00:00:00Z`) };
  // Everyone active, plus archived people who worked during the period.
  const employees = await ctx.db.employee.findMany({
    where: {
      OR: [
        { status: { not: "ARCHIVED" } },
        { timeEntries: { some: { clockInAt: { gte: keyToUtcDate(period.start) } } } },
      ],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const ids = employees.map((e) => e.id);
  const [entries, inputs, { tables, versions }, mtd, adjustments, loans] = await Promise.all([
    loadEntries(ctx.company.id, ids, period.start, period.end, ctx.company.timezone),
    loadPayInputs(ctx, ids, period),
    loadStatutoryTables(run.payDate),
    monthToDate(ctx, run.id, period.end),
    ctx.db.payAdjustment.findMany({
      where: { OR: [{ payRunId: run.id }, { recurring: true, payRunId: null }] },
    }),
    ctx.db.loan.findMany({ where: { status: "ACTIVE", startDate: { lte: bounds.lte } } }),
  ]);
  let totals = { gross: 0, net: 0, employeeContributions: 0, employerContributions: 0, tax: 0, employees: 0 };
  await prisma.$transaction(async (tx) => {
    await tx.payRunItem.deleteMany({ where: { payRunId: run.id } });
    for (const emp of employees) {
      const own = entries.filter((e) => e.employeeId === emp.id && e.clockOutAt);
      const g = computeEmployeePeriod(ctx, emp, own, period, inputs);
      const adj = adjustments.filter((a) => a.employeeId === emp.id);
      if (g.gross.gross === 0 && adj.length === 0 && emp.status === "ARCHIVED") continue;
      if (g.gross.gross === 0 && adj.length === 0 && own.length === 0 && emp.payType !== "MONTHLY") continue;
      const before = mtd.get(emp.id);
      const slip = computePayslip({
        frequency: ctx.company.payFrequency,
        cutoffIndex: run.cutoffIndex,
        contributionSchedule: ctx.settings.contributionSchedule,
        grossLines: g.gross.lines,
        gross: g.gross.gross,
        basic: g.gross.basic,
        monthlyBasic: monthlyBasicFromRate(
          emp.payType,
          emp.rateCentavos,
          emp.workDaysPerYear,
          ctx.settings.dailyRegularMinutes,
        ),
        isMinimumWageEarner: emp.isMinimumWageEarner,
        adjustments: adj.map((a) => ({
          kind: a.kind,
          label: a.label,
          amount: a.amountCentavos,
          taxable: a.taxable,
        })),
        loans: loans
          .filter((l) => l.employeeId === emp.id)
          .map((l) => ({
            id: l.id,
            label: l.label,
            amortization: l.amortizationCentavos,
            balance: l.balanceCentavos,
          })),
        monthGrossBefore: before?.gross ?? 0,
        monthContributionsBefore: before?.c ?? ZERO_CONTRIBUTIONS,
        tables,
      });
      const warnings = [...slip.warnings];
      if (g.gross.unapprovedOvertimeMinutes)
        warnings.push(
          `${Math.round(g.gross.unapprovedOvertimeMinutes / 6) / 10}h overtime not approved (unpaid).`,
        );
      if (!emp.sssEnc || !emp.philhealthEnc || !emp.pagibigEnc || !emp.tinEnc)
        warnings.push("Missing government ID numbers.");
      await tx.payRunItem.create({
        data: {
          payRunId: run.id,
          companyId: ctx.company.id,
          employeeId: emp.id,
          minutes: json(g.hours.totals),
          earnings: json(slip.earnings),
          deductions: json(slip.deductions),
          grossCentavos: slip.gross,
          basicCentavos: slip.basic,
          sssEe: slip.contributions.sssEe,
          sssEr: slip.contributions.sssEr,
          sssEc: slip.contributions.sssEc,
          philhealthEe: slip.contributions.philhealthEe,
          philhealthEr: slip.contributions.philhealthEr,
          pagibigEe: slip.contributions.pagibigEe,
          pagibigEr: slip.contributions.pagibigEr,
          taxableCentavos: slip.taxable,
          withholdingTax: slip.withholdingTax,
          otherDeductions: slip.otherDeductions,
          netCentavos: slip.net,
          tableVersions: versions,
          warnings,
        },
      });
      totals = {
        gross: totals.gross + slip.gross,
        net: totals.net + slip.net,
        employeeContributions:
          totals.employeeContributions +
          slip.contributions.sssEe +
          slip.contributions.philhealthEe +
          slip.contributions.pagibigEe,
        employerContributions:
          totals.employerContributions +
          slip.contributions.sssEr +
          slip.contributions.sssEc +
          slip.contributions.philhealthEr +
          slip.contributions.pagibigEr,
        tax: totals.tax + slip.withholdingTax,
        employees: totals.employees + 1,
      };
    }
    await tx.payRun.update({
      where: { id: run.id },
      data: { status: "COMPUTED", computedAt: new Date(), totals },
    });
  });
  return totals;
}

export async function addRunAdjustment(
  ctx: AppContext,
  runId: string,
  input: {
    employeeId: string;
    kind: "ALLOWANCE" | "BONUS" | "DEDUCTION" | "REIMBURSEMENT";
    label: string;
    amount: number;
    taxable: boolean;
    recurring: boolean;
  },
) {
  requireFeature(ctx, "payroll");
  const run = await ctx.db.payRun.findUnique({ where: { id: runId } });
  if (!run || run.status === "FINALIZED" || run.status === "PAID")
    throw new UserError("You can only adjust a draft pay run.");
  if (!(await ctx.db.employee.findUnique({ where: { id: input.employeeId } })))
    throw new UserError("Employee not found.");
  if (!input.label.trim()) throw new UserError("Describe the adjustment.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new UserError("Enter a positive amount.");
  await ctx.db.payAdjustment.create({
    data: {
      companyId: ctx.company.id,
      employeeId: input.employeeId,
      payRunId: input.recurring ? null : runId,
      kind: input.kind,
      label: input.label.trim(),
      amountCentavos: input.amount,
      taxable: input.taxable,
      recurring: input.recurring,
    },
  });
  await writeAudit(actorFrom(ctx), {
    action: "payroll.adjustment",
    entityType: "PayRun",
    entityId: runId,
    after: input,
  });
  await computePayRun(ctx, runId);
}

export async function removeAdjustment(ctx: AppContext, adjustmentId: string, runId: string) {
  const adj = await ctx.db.payAdjustment.findUnique({ where: { id: adjustmentId } });
  if (!adj) throw new UserError("Adjustment not found.");
  await ctx.db.payAdjustment.delete({ where: { id: adjustmentId } });
  await writeAudit(actorFrom(ctx), {
    action: "payroll.adjustment.remove",
    entityType: "PayAdjustment",
    entityId: adjustmentId,
    before: adj,
  });
  await computePayRun(ctx, runId);
}

/** Lock the run: freeze timesheets and time entries, apply loan payments, generate payslips. */
export async function finalizePayRun(ctx: AppContext, runId: string) {
  requireFeature(ctx, "payroll");
  if (!ctx.isAdmin) throw new UserError("Only owners and admins can finalize payroll.");
  const run = await ctx.db.payRun.findUnique({
    where: { id: runId },
    include: { items: { include: { employee: true } } },
  });
  if (!run) throw new UserError("Pay run not found.");
  if (run.status !== "COMPUTED")
    throw new UserError(
      run.status === "DRAFT" ? "Calculate the pay run first." : "This pay run is already finalized.",
    );
  if (run.items.length === 0) throw new UserError("There's no one to pay in this run.");
  const period = { start: utcDateToKey(run.periodStart), end: utcDateToKey(run.periodEnd) };
  const tz = ctx.company.timezone;
  await prisma.$transaction(async (tx) => {
    for (const item of run.items) {
      if (run.kind === "REGULAR") {
        await tx.timesheet.upsert({
          where: { employeeId_periodStart: { employeeId: item.employeeId, periodStart: run.periodStart } },
          create: {
            companyId: ctx.company.id,
            employeeId: item.employeeId,
            periodStart: run.periodStart,
            periodEnd: run.periodEnd,
            status: "LOCKED",
            approvedAt: new Date(),
            approvedById: ctx.employee.id,
          },
          update: { status: "LOCKED" },
        });
      }
      for (const d of item.deductions as { code: string; amount: number; loanId?: string }[]) {
        if (d.code !== "LOAN" || !d.loanId) continue;
        const loan = await tx.loan.findUnique({ where: { id: d.loanId } });
        if (!loan) continue;
        const balance = Math.max(0, loan.balanceCentavos - d.amount);
        await tx.loan.update({
          where: { id: loan.id },
          data: { balanceCentavos: balance, status: balance === 0 ? "PAID" : "ACTIVE" },
        });
      }
    }
    if (run.kind === "REGULAR") {
      await tx.timeEntry.updateMany({
        where: {
          companyId: ctx.company.id,
          clockInAt: periodBounds(period.start, period.end, tz),
          clockOutAt: { not: null },
        },
        data: { status: "LOCKED", payRunId: run.id },
      });
    }
    if (run.kind === "THIRTEENTH_MONTH") {
      await tx.leaveBalance.updateMany({
        where: {
          companyId: ctx.company.id,
          year: run.periodEnd.getUTCFullYear(),
          leaveType: { isSil: true },
        },
        data: { convertedAt: new Date() },
      });
    }
    await tx.payRun.update({
      where: { id: run.id },
      data: { status: "FINALIZED", finalizedAt: new Date(), finalizedById: ctx.employee.id },
    });
  });
  await writeAudit(actorFrom(ctx), {
    action: "payroll.finalize",
    entityType: "PayRun",
    entityId: run.id,
    after: run.totals,
  });
  await generatePayslips(ctx, run.id);
}

export async function generatePayslips(ctx: AppContext, runId: string) {
  const run = await ctx.db.payRun.findUnique({
    where: { id: runId },
    include: { items: { include: { employee: { include: { position: true } } } } },
  });
  if (!run) return;
  for (const item of run.items) {
    const pdf = await renderPayslipPdf({ company: ctx.company, run, item, employee: item.employee });
    const key = `${ctx.company.id}/payslips/${item.employeeId}/${run.id}.pdf`;
    await storage().put(key, pdf, "application/pdf");
    await prisma.payRunItem.update({ where: { id: item.id }, data: { payslipKey: key } });
  }
}

export async function markPaid(ctx: AppContext, runId: string, emailPayslips: boolean) {
  const run = await ctx.db.payRun.findUnique({
    where: { id: runId },
    include: { items: { include: { employee: true } } },
  });
  if (!run || run.status !== "FINALIZED") throw new UserError("Finalize the pay run first.");
  await ctx.db.payRun.update({ where: { id: runId }, data: { status: "PAID", paidAt: new Date() } });
  await writeAudit(actorFrom(ctx), { action: "payroll.paid", entityType: "PayRun", entityId: runId });
  for (const item of run.items) {
    await notify(ctx.company.id, item.employeeId, {
      kind: "payslip",
      title: "Your payslip is ready",
      body: `Net pay for ${utcDateToKey(run.periodStart)} – ${utcDateToKey(run.periodEnd)}.`,
      url: "/me/payslips",
    });
    if (emailPayslips && item.employee.email && item.payslipKey) {
      const pdf = await storage().get(item.payslipKey);
      if (!pdf) continue;
      await sendEmail({
        to: item.employee.email,
        subject: `Payslip · ${ctx.company.name} · ${utcDateToKey(run.payDate)}`,
        html: layout(
          "Your payslip",
          `<p>Hi ${escapeHtml(item.employee.firstName)}, your payslip for ${utcDateToKey(run.periodStart)} to ${utcDateToKey(run.periodEnd)} is attached.</p>`,
        ),
        attachments: [{ filename: `payslip-${utcDateToKey(run.payDate)}.pdf`, content: pdf }],
      });
      await prisma.payRunItem.update({ where: { id: item.id }, data: { emailedAt: new Date() } });
    }
  }
}

export async function deletePayRun(ctx: AppContext, runId: string) {
  const run = await ctx.db.payRun.findUnique({ where: { id: runId } });
  if (!run) throw new UserError("Pay run not found.");
  if (run.status === "FINALIZED" || run.status === "PAID")
    throw new UserError("Finalized pay runs can't be deleted.");
  await ctx.db.payRun.delete({ where: { id: runId } });
  await writeAudit(actorFrom(ctx), { action: "payroll.delete", entityType: "PayRun", entityId: runId });
}

// ───────────── Year-end: 13th-month pay + SIL cash conversion ─────────────

export async function createYearEndRun(ctx: AppContext, year: number, payDate: string) {
  requireFeature(ctx, "payroll");
  const existing = await ctx.db.payRun.findFirst({
    where: { kind: "THIRTEENTH_MONTH", periodStart: keyToUtcDate(`${year}-01-01`) },
  });
  if (existing) return existing;
  const run = await ctx.db.payRun.create({
    data: {
      companyId: ctx.company.id,
      kind: "THIRTEENTH_MONTH",
      periodStart: keyToUtcDate(`${year}-01-01`),
      periodEnd: keyToUtcDate(`${year}-12-31`),
      payDate: keyToUtcDate(payDate),
      createdById: ctx.employee.id,
    },
  });
  await computeYearEndRun(ctx, run.id);
  return run;
}

async function computeYearEndRun(ctx: AppContext, runId: string) {
  const run = await ctx.db.payRun.findUniqueOrThrow({ where: { id: runId } });
  const year = run.periodEnd.getUTCFullYear();
  const today = dateKey(new Date(), ctx.company.timezone);
  const basics = await ctx.db.payRunItem.groupBy({
    by: ["employeeId"],
    where: {
      payRun: {
        kind: "REGULAR",
        status: { in: ["FINALIZED", "PAID"] },
        periodStart: { gte: keyToUtcDate(`${year}-01-01`), lte: keyToUtcDate(`${year}-12-31`) },
      },
    },
    _sum: { basicCentavos: true },
  });
  const employees = await ctx.db.employee.findMany({
    where: { id: { in: basics.map((b) => b.employeeId) } },
  });
  let totals = { gross: 0, net: 0, employeeContributions: 0, employerContributions: 0, tax: 0, employees: 0 };
  await prisma.$transaction(async (tx) => {
    await tx.payRunItem.deleteMany({ where: { payRunId: run.id } });
    for (const emp of employees) {
      const basic = basics.find((b) => b.employeeId === emp.id)?._sum.basicCentavos ?? 0;
      const thirteenth = thirteenthMonth(basic);
      const earnings: { code: string; label: string; amount: number; days?: number }[] = [];
      if (thirteenth > 0)
        earnings.push({
          code: "THIRTEENTH",
          label: `13th-month pay (₱${(basic / 100).toLocaleString()} basic ÷ 12)`,
          amount: thirteenth,
        });
      // Unused Service Incentive Leave is converted to cash at year end (Labor Code art. 95).
      const sil = (await leaveBalances(ctx, emp, year)).find((b) => b.type.isSil);
      const silDays = sil && sil.remaining && sil.remaining > 0 ? sil.remaining : 0;
      if (silDays > 0) {
        const daily = dailyRate(
          { payType: emp.payType, rateCentavos: emp.rateCentavos, workDaysPerYear: emp.workDaysPerYear },
          ctx.settings.dailyRegularMinutes,
        );
        earnings.push({
          code: "SIL_CASH",
          label: `Unused SIL converted to cash`,
          days: silDays,
          amount: Math.round(silDays * daily),
        });
      }
      const gross = earnings.reduce((s, e) => s + e.amount, 0);
      if (gross === 0) continue;
      const warnings: string[] = [];
      if (thirteenth > OTHER_BENEFITS_EXEMPTION)
        warnings.push(
          `13th-month pay above ₱90,000 is taxable; include the excess in year-end tax annualization.`,
        );
      if (utcDateToKey(run.payDate) > `${year}-12-24`)
        warnings.push("13th-month pay must be paid on or before December 24.");
      if (today < `${year}-12-01`)
        warnings.push(
          "Computed from pay runs finalized so far this year. Recalculate after the last regular run.",
        );
      await tx.payRunItem.create({
        data: {
          payRunId: run.id,
          companyId: ctx.company.id,
          employeeId: emp.id,
          earnings,
          deductions: [],
          grossCentavos: gross,
          basicCentavos: 0,
          netCentavos: gross,
          warnings,
        },
      });
      totals = {
        ...totals,
        gross: totals.gross + gross,
        net: totals.net + gross,
        employees: totals.employees + 1,
      };
    }
    await tx.payRun.update({
      where: { id: run.id },
      data: { status: "COMPUTED", computedAt: new Date(), totals },
    });
  });
  return totals;
}

export function runLabel(run: { kind: string; periodStart: Date; periodEnd: Date }) {
  if (run.kind === "THIRTEENTH_MONTH") return `${run.periodStart.getUTCFullYear()} 13th month & SIL`;
  return `${utcDateToKey(run.periodStart)} – ${utcDateToKey(run.periodEnd)}`;
}

/**
 * Turns a period's gross pay into a payslip: statutory contributions, withholding tax,
 * allowances, loans and other deductions, and net pay. Pure, so it is easy to test.
 *
 * Contributions are monthly amounts. For semi-monthly payroll the 1st cut-off deducts a share
 * (by company policy) based on an estimate, and the 2nd cut-off trues up to the month's actual.
 */
import type { PayFrequency } from "@/generated/prisma/enums";
import type { EarningLine } from "./gross";
import {
  pagIbigContribution,
  philHealthContribution,
  sssContribution,
  withholdingTax,
  type PagIbigTable,
  type PhilHealthTable,
  type SssTable,
  type WithholdingTable,
} from "./statutory";

export type StatutoryTables = {
  sss: SssTable;
  philhealth: PhilHealthTable;
  pagibig: PagIbigTable;
  withholding: WithholdingTable;
};

export type Adjustment = {
  kind: "ALLOWANCE" | "BONUS" | "DEDUCTION" | "REIMBURSEMENT";
  label: string;
  amount: number;
  taxable: boolean;
};
export type LoanInput = { id: string; label: string; amortization: number; balance: number };

export type Contributions = {
  sssEe: number;
  sssEr: number;
  sssEc: number;
  philhealthEe: number;
  philhealthEr: number;
  pagibigEe: number;
  pagibigEr: number;
};

export const ZERO_CONTRIBUTIONS: Contributions = {
  sssEe: 0,
  sssEr: 0,
  sssEc: 0,
  philhealthEe: 0,
  philhealthEr: 0,
  pagibigEe: 0,
  pagibigEr: 0,
};

export type PayslipInput = {
  frequency: PayFrequency;
  cutoffIndex: number;
  contributionSchedule: "SPLIT" | "SECOND_CUTOFF" | "FIRST_CUTOFF";
  /** Gross from hours (computeGross) */
  grossLines: EarningLine[];
  gross: number;
  basic: number;
  /** Monthly basic salary used for PhilHealth and Pag-IBIG */
  monthlyBasic: number;
  isMinimumWageEarner: boolean;
  adjustments: Adjustment[];
  loans: LoanInput[];
  /** Gross already paid this calendar month in finalized runs */
  monthGrossBefore: number;
  /** Contributions already deducted this calendar month */
  monthContributionsBefore: Contributions;
  tables: StatutoryTables;
};

export type DeductionLine = { code: string; label: string; amount: number; loanId?: string };

export type Payslip = {
  earnings: EarningLine[];
  deductions: DeductionLine[];
  gross: number;
  basic: number;
  contributions: Contributions;
  taxable: number;
  withholdingTax: number;
  otherDeductions: number;
  net: number;
  warnings: string[];
};

/** Share of the month's contribution that should have been deducted by the end of this run. */
export function contributionShare(
  frequency: PayFrequency,
  cutoffIndex: number,
  schedule: PayslipInput["contributionSchedule"],
) {
  if (frequency !== "SEMI_MONTHLY") return 1;
  if (cutoffIndex >= 2) return 1;
  return schedule === "SPLIT" ? 0.5 : schedule === "FIRST_CUTOFF" ? 1 : 0;
}

/** Best estimate of the month's total compensation, for the contribution brackets. */
export function estimateMonthlyCompensation(
  frequency: PayFrequency,
  cutoffIndex: number,
  gross: number,
  monthGrossBefore: number,
) {
  switch (frequency) {
    case "MONTHLY":
      return gross;
    case "WEEKLY":
      return Math.round((gross * 52) / 12);
    case "SEMI_MONTHLY":
      return cutoffIndex >= 2 ? monthGrossBefore + gross : gross * 2;
  }
}

export function computeContributions(
  input: Pick<
    PayslipInput,
    | "frequency"
    | "cutoffIndex"
    | "contributionSchedule"
    | "monthlyBasic"
    | "monthGrossBefore"
    | "monthContributionsBefore"
    | "tables"
  >,
  gross: number,
): Contributions {
  const monthlyComp = estimateMonthlyCompensation(
    input.frequency,
    input.cutoffIndex,
    gross,
    input.monthGrossBefore,
  );
  const sss = sssContribution(monthlyComp, input.tables.sss);
  const ph = philHealthContribution(input.monthlyBasic, input.tables.philhealth);
  const pi = pagIbigContribution(input.monthlyBasic || monthlyComp, input.tables.pagibig);
  const monthly: Contributions = {
    sssEe: sss.ee,
    sssEr: sss.er,
    sssEc: sss.ec,
    philhealthEe: ph.ee,
    philhealthEr: ph.er,
    pagibigEe: pi.ee,
    pagibigEr: pi.er,
  };
  if (input.frequency === "WEEKLY") {
    // No reliable true-up across 4–5 weeks: spread the monthly amount evenly per week.
    return Object.fromEntries(
      Object.entries(monthly).map(([k, v]) => [k, Math.round((v * 12) / 52)]),
    ) as Contributions;
  }
  const share = contributionShare(input.frequency, input.cutoffIndex, input.contributionSchedule);
  const out = { ...ZERO_CONTRIBUTIONS };
  for (const key of Object.keys(monthly) as (keyof Contributions)[]) {
    out[key] = Math.max(0, Math.round(monthly[key] * share) - input.monthContributionsBefore[key]);
  }
  return out;
}

export function computePayslip(input: PayslipInput): Payslip {
  const warnings: string[] = [];
  const earnings: EarningLine[] = [...input.grossLines];
  let taxableExtras = 0;
  let nontaxableExtras = 0;
  const otherDeductionLines: DeductionLine[] = [];
  for (const a of input.adjustments) {
    if (a.kind === "DEDUCTION") {
      otherDeductionLines.push({ code: "DEDUCTION", label: a.label, amount: Math.abs(a.amount) });
      continue;
    }
    earnings.push({ code: a.kind, label: a.label, amount: a.amount });
    if (a.taxable && a.kind !== "REIMBURSEMENT") taxableExtras += a.amount;
    else nontaxableExtras += a.amount;
  }
  const gross = input.gross + taxableExtras + nontaxableExtras;
  // Contributions are based on compensation from work (and taxable pay items), not reimbursements.
  const contributions = computeContributions(input, input.gross + taxableExtras);
  const eeTotal = contributions.sssEe + contributions.philhealthEe + contributions.pagibigEe;
  // Minimum wage earners are exempt on statutory minimum wage, holiday pay, OT, night diff (TRAIN law).
  const taxableComp = input.isMinimumWageEarner ? taxableExtras : input.gross + taxableExtras - eeTotal;
  const taxable = Math.max(0, taxableComp);
  const tax = withholdingTax(taxable, input.tables.withholding[input.frequency]);

  const deductions: DeductionLine[] = [];
  const push = (code: string, label: string, amount: number) =>
    amount > 0 && deductions.push({ code, label, amount });
  push("SSS", "SSS contribution", contributions.sssEe);
  push("PHILHEALTH", "PhilHealth contribution", contributions.philhealthEe);
  push("PAGIBIG", "Pag-IBIG contribution", contributions.pagibigEe);
  push("TAX", "Withholding tax", tax);
  deductions.push(...otherDeductionLines);

  // Loans come last and never push net pay below zero.
  let available = gross - deductions.reduce((s, d) => s + d.amount, 0);
  for (const loan of input.loans) {
    const due = Math.min(loan.amortization, loan.balance);
    const take = Math.max(0, Math.min(due, available));
    if (take < due)
      warnings.push(`${loan.label}: only ${take / 100} of ${due / 100} deducted (not enough pay).`);
    if (take > 0) {
      deductions.push({ code: "LOAN", label: loan.label, amount: take, loanId: loan.id });
      available -= take;
    }
  }
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const net = gross - totalDeductions;
  if (net < 0) warnings.push("Deductions are larger than gross pay.");
  return {
    earnings,
    deductions,
    gross,
    basic: input.basic,
    contributions,
    taxable,
    withholdingTax: tax,
    otherDeductions: totalDeductions - eeTotal - tax,
    net,
    warnings,
  };
}

/** 13th-month pay: total basic salary earned in the calendar year divided by 12 (PD 851). */
export function thirteenthMonth(basicEarnedInYear: number) {
  return Math.round(Math.max(0, basicEarnedInYear) / 12);
}

/** Monthly basic salary from the employee's rate, for PhilHealth and Pag-IBIG. */
export function monthlyBasicFromRate(
  payType: "HOURLY" | "DAILY" | "MONTHLY",
  rate: number,
  workDaysPerYear: number,
  dailyRegularMinutes = 480,
) {
  if (payType === "MONTHLY") return rate;
  const daily = payType === "DAILY" ? rate : (rate * dailyRegularMinutes) / 60;
  return Math.round((daily * workDaysPerYear) / 12);
}

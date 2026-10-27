import { describe, expect, it } from "vitest";
import {
  computePayslip,
  monthlyBasicFromRate,
  thirteenthMonth,
  ZERO_CONTRIBUTIONS,
  type PayslipInput,
} from "@/lib/pay/payroll";
import {
  PAGIBIG_2024,
  PHILHEALTH_2025,
  SSS_2025,
  WITHHOLDING_2023,
  pagIbigContribution,
  philHealthContribution,
  sssContribution,
  sssMsc,
  withholdingTax,
} from "@/lib/pay/statutory";

const P = (pesos: number) => Math.round(pesos * 100);
const tables = {
  sss: SSS_2025,
  philhealth: PHILHEALTH_2025,
  pagibig: PAGIBIG_2024,
  withholding: WITHHOLDING_2023,
};

describe("SSS", () => {
  it("maps compensation to the monthly salary credit", () => {
    expect(sssMsc(P(4000), SSS_2025)).toBe(P(5000));
    expect(sssMsc(P(5249.99), SSS_2025)).toBe(P(5000));
    expect(sssMsc(P(5250), SSS_2025)).toBe(P(5500));
    expect(sssMsc(P(20000), SSS_2025)).toBe(P(20000));
    expect(sssMsc(P(34750), SSS_2025)).toBe(P(35000));
    expect(sssMsc(P(80000), SSS_2025)).toBe(P(35000));
  });
  it("splits 15% between employee (5%) and employer (10%), with EC and MPF", () => {
    expect(sssContribution(P(10000), SSS_2025)).toMatchObject({
      ee: P(500),
      er: P(1000),
      ec: P(10),
      eeMpf: 0,
    });
    expect(sssContribution(P(20000), SSS_2025)).toMatchObject({
      ee: P(1000),
      er: P(2000),
      ec: P(30),
      eeMpf: 0,
    });
    expect(sssContribution(P(30000), SSS_2025)).toMatchObject({
      ee: P(1500),
      er: P(3000),
      ec: P(30),
      eeMpf: P(500),
      erMpf: P(1000),
    });
    expect(sssContribution(P(100000), SSS_2025)).toMatchObject({ ee: P(1750), er: P(3500) });
    expect(sssContribution(0, SSS_2025).ee).toBe(0);
  });
});

describe("PhilHealth", () => {
  it("charges 5% of basic between the floor and ceiling, split equally", () => {
    expect(philHealthContribution(P(8000), PHILHEALTH_2025)).toEqual({
      total: P(500),
      ee: P(250),
      er: P(250),
    });
    expect(philHealthContribution(P(50000), PHILHEALTH_2025)).toEqual({
      total: P(2500),
      ee: P(1250),
      er: P(1250),
    });
    expect(philHealthContribution(P(150000), PHILHEALTH_2025)).toEqual({
      total: P(5000),
      ee: P(2500),
      er: P(2500),
    });
  });
});

describe("Pag-IBIG", () => {
  it("uses 1% for low earners, 2% otherwise, capped at the ₱10,000 fund salary", () => {
    expect(pagIbigContribution(P(1500), PAGIBIG_2024)).toEqual({ ee: P(15), er: P(30) });
    expect(pagIbigContribution(P(5000), PAGIBIG_2024)).toEqual({ ee: P(100), er: P(100) });
    expect(pagIbigContribution(P(20000), PAGIBIG_2024)).toEqual({ ee: P(200), er: P(200) });
  });
});

describe("BIR withholding (TRAIN 2023)", () => {
  it("applies the semi-monthly table", () => {
    expect(withholdingTax(P(10000), WITHHOLDING_2023.SEMI_MONTHLY)).toBe(0);
    expect(withholdingTax(P(10417), WITHHOLDING_2023.SEMI_MONTHLY)).toBe(0);
    expect(withholdingTax(P(15000), WITHHOLDING_2023.SEMI_MONTHLY)).toBe(P(687.45));
    expect(withholdingTax(P(20000), WITHHOLDING_2023.SEMI_MONTHLY)).toBe(P(1604.1));
    expect(withholdingTax(P(40000), WITHHOLDING_2023.SEMI_MONTHLY)).toBe(P(5937.45));
  });
  it("applies the monthly and weekly tables", () => {
    expect(withholdingTax(P(30000), WITHHOLDING_2023.MONTHLY)).toBe(P(1375.05));
    expect(withholdingTax(P(4000), WITHHOLDING_2023.WEEKLY)).toBe(0);
    expect(withholdingTax(P(10000), WITHHOLDING_2023.WEEKLY)).toBe(P(432.6 + (10000 - 7692) * 0.2));
  });
});

function base(overrides: Partial<PayslipInput> = {}): PayslipInput {
  return {
    frequency: "SEMI_MONTHLY",
    cutoffIndex: 1,
    contributionSchedule: "SPLIT",
    grossLines: [{ code: "BASIC", label: "Basic pay", amount: P(15000) }],
    gross: P(15000),
    basic: P(15000),
    monthlyBasic: P(30000),
    isMinimumWageEarner: false,
    adjustments: [],
    loans: [],
    monthGrossBefore: 0,
    monthContributionsBefore: ZERO_CONTRIBUTIONS,
    tables,
    ...overrides,
  };
}

describe("payslip", () => {
  it("1st cut-off: half the month's contributions, tax on the rest", () => {
    const s = computePayslip(base());
    expect(s.contributions).toMatchObject({
      sssEe: P(750),
      philhealthEe: P(375),
      pagibigEe: P(100),
      sssEr: P(1500),
      sssEc: P(15),
    });
    expect(s.taxable).toBe(P(13775));
    expect(s.withholdingTax).toBe(P(503.7));
    expect(s.net).toBe(P(13271.3));
  });

  it("2nd cut-off trues up to the month's actual contributions", () => {
    const first = computePayslip(base());
    const s = computePayslip(
      base({ cutoffIndex: 2, monthGrossBefore: P(15000), monthContributionsBefore: first.contributions }),
    );
    expect(s.contributions.sssEe).toBe(P(750));
    expect(first.contributions.sssEe + s.contributions.sssEe).toBe(P(1500));
    expect(first.contributions.philhealthEe + s.contributions.philhealthEe).toBe(P(750));
  });

  it("can deduct everything on the 2nd cut-off", () => {
    const first = computePayslip(base({ contributionSchedule: "SECOND_CUTOFF" }));
    expect(first.contributions.sssEe).toBe(0);
    const second = computePayslip(
      base({ contributionSchedule: "SECOND_CUTOFF", cutoffIndex: 2, monthGrossBefore: P(15000) }),
    );
    expect(second.contributions.sssEe).toBe(P(1500));
  });

  it("exempts minimum wage earners from tax but not contributions", () => {
    const s = computePayslip(
      base({
        isMinimumWageEarner: true,
        gross: P(9000),
        basic: P(9000),
        monthlyBasic: P(18000),
        grossLines: [],
      }),
    );
    expect(s.withholdingTax).toBe(0);
    expect(s.contributions.sssEe).toBeGreaterThan(0);
  });

  it("handles allowances, deductions and loans without going negative", () => {
    const s = computePayslip(
      base({
        adjustments: [
          { kind: "ALLOWANCE", label: "Rice allowance (de minimis)", amount: P(1000), taxable: false },
          { kind: "BONUS", label: "Performance bonus", amount: P(2000), taxable: true },
          { kind: "DEDUCTION", label: "Uniform", amount: P(500), taxable: false },
        ],
        loans: [{ id: "l1", label: "Cash advance", amortization: P(1000), balance: P(600) }],
      }),
    );
    expect(s.gross).toBe(P(18000));
    expect(s.deductions.find((d) => d.code === "LOAN")?.amount).toBe(P(600));
    expect(s.deductions.find((d) => d.code === "DEDUCTION")?.amount).toBe(P(500));
    const huge = computePayslip(
      base({ loans: [{ id: "l2", label: "Big loan", amortization: P(50000), balance: P(50000) }] }),
    );
    expect(huge.net).toBe(0);
    expect(huge.warnings[0]).toMatch(/Big loan/);
  });

  it("spreads monthly contributions across weekly payrolls", () => {
    const s = computePayslip(
      base({ frequency: "WEEKLY", gross: P(5000), basic: P(5000), monthlyBasic: P(21667), grossLines: [] }),
    );
    // monthly comp ≈ 21,667 → MSC 21,500 → ₱1,075/month → ×12/52 ≈ ₱248.08
    expect(s.contributions.sssEe).toBe(Math.round((P(1075) * 12) / 52));
  });
});

describe("13th month & rates", () => {
  it("is total basic over 12", () => {
    expect(thirteenthMonth(P(180000))).toBe(P(15000));
  });
  it("derives monthly basic from daily/hourly rates", () => {
    expect(monthlyBasicFromRate("DAILY", P(700), 313)).toBe(P(18258.33));
    expect(monthlyBasicFromRate("MONTHLY", P(25000), 313)).toBe(P(25000));
    expect(monthlyBasicFromRate("HOURLY", P(100), 261)).toBe(P(17400));
  });
});

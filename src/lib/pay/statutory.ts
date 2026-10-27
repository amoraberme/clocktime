/**
 * Philippine statutory contribution and withholding-tax rules.
 * All amounts are centavos. These defaults are seeded into StatutoryTable (versioned by
 * effective date) and can be edited by a ClockTime super-admin when agencies change rates.
 * Verify against the latest SSS, PhilHealth, Pag-IBIG and BIR issuances before live payroll.
 */

export type SssTable = {
  /** Employee share of the Monthly Salary Credit */
  eeRate: number;
  /** Employer share of the Monthly Salary Credit */
  erRate: number;
  mscMin: number;
  mscMax: number;
  mscStep: number;
  /** MSC above this goes to the Mandatory Provident Fund (WISP) */
  regularMscMax: number;
  ecLow: number;
  ecHigh: number;
  /** MSC at or above which the higher EC rate applies */
  ecThreshold: number;
};

export type PhilHealthTable = { rate: number; floor: number; ceiling: number };

export type PagIbigTable = {
  eeRateLow: number;
  eeRateHigh: number;
  /** Monthly compensation at or below this uses eeRateLow */
  lowThreshold: number;
  erRate: number;
  maxFundSalary: number;
};

export type TaxBracket = { over: number; base: number; rate: number };
export type WithholdingTable = Record<"DAILY" | "WEEKLY" | "SEMI_MONTHLY" | "MONTHLY", TaxBracket[]>;

export const SSS_2025: SssTable = {
  eeRate: 0.05,
  erRate: 0.1,
  mscMin: 5_000_00,
  mscMax: 35_000_00,
  mscStep: 500_00,
  regularMscMax: 20_000_00,
  ecLow: 10_00,
  ecHigh: 30_00,
  ecThreshold: 15_000_00,
};

export const PHILHEALTH_2025: PhilHealthTable = { rate: 0.05, floor: 10_000_00, ceiling: 100_000_00 };

export const PAGIBIG_2024: PagIbigTable = {
  eeRateLow: 0.01,
  eeRateHigh: 0.02,
  lowThreshold: 1_500_00,
  erRate: 0.02,
  maxFundSalary: 10_000_00,
};

const b = (over: number, base: number, rate: number): TaxBracket => ({ over, base, rate });

/** BIR revised withholding tax table (TRAIN law), effective January 1, 2023. */
export const WITHHOLDING_2023: WithholdingTable = {
  DAILY: [
    b(0, 0, 0),
    b(685_00, 0, 0.15),
    b(1_096_00, 61_65, 0.2),
    b(2_192_00, 280_85, 0.25),
    b(5_479_00, 1_102_60, 0.3),
    b(21_918_00, 6_034_30, 0.35),
  ],
  WEEKLY: [
    b(0, 0, 0),
    b(4_808_00, 0, 0.15),
    b(7_692_00, 432_60, 0.2),
    b(15_385_00, 1_971_20, 0.25),
    b(38_462_00, 7_740_45, 0.3),
    b(153_846_00, 42_355_65, 0.35),
  ],
  SEMI_MONTHLY: [
    b(0, 0, 0),
    b(10_417_00, 0, 0.15),
    b(16_667_00, 937_50, 0.2),
    b(33_333_00, 4_270_70, 0.25),
    b(83_333_00, 16_770_70, 0.3),
    b(333_333_00, 91_770_70, 0.35),
  ],
  MONTHLY: [
    b(0, 0, 0),
    b(20_833_00, 0, 0.15),
    b(33_333_00, 1_875_00, 0.2),
    b(66_667_00, 8_541_80, 0.25),
    b(166_667_00, 33_541_80, 0.3),
    b(666_667_00, 183_541_80, 0.35),
  ],
};

/** Annual exemption for 13th-month pay and other benefits. */
export const OTHER_BENEFITS_EXEMPTION = 90_000_00;

export function sssMsc(monthlyCompensation: number, t: SssTable) {
  const msc = Math.floor((monthlyCompensation + t.mscStep / 2) / t.mscStep) * t.mscStep;
  return Math.min(t.mscMax, Math.max(t.mscMin, msc));
}

export type SssContribution = {
  msc: number;
  ee: number;
  er: number;
  ec: number;
  eeMpf: number;
  erMpf: number;
};

/** Monthly SSS contribution for a month's total compensation. */
export function sssContribution(monthlyCompensation: number, t: SssTable): SssContribution {
  if (monthlyCompensation <= 0) return { msc: 0, ee: 0, er: 0, ec: 0, eeMpf: 0, erMpf: 0 };
  const msc = sssMsc(monthlyCompensation, t);
  const mpfBase = Math.max(0, msc - t.regularMscMax);
  return {
    msc,
    ee: Math.round(msc * t.eeRate),
    er: Math.round(msc * t.erRate),
    ec: msc >= t.ecThreshold ? t.ecHigh : t.ecLow,
    eeMpf: Math.round(mpfBase * t.eeRate),
    erMpf: Math.round(mpfBase * t.erRate),
  };
}

/** Monthly PhilHealth premium on basic salary, split equally. */
export function philHealthContribution(monthlyBasic: number, t: PhilHealthTable) {
  if (monthlyBasic <= 0) return { total: 0, ee: 0, er: 0 };
  const base = Math.min(t.ceiling, Math.max(t.floor, monthlyBasic));
  const total = Math.round(base * t.rate);
  const ee = Math.floor(total / 2);
  return { total, ee, er: total - ee };
}

/** Monthly Pag-IBIG (HDMF) contribution. */
export function pagIbigContribution(monthlyCompensation: number, t: PagIbigTable) {
  if (monthlyCompensation <= 0) return { ee: 0, er: 0 };
  const base = Math.min(t.maxFundSalary, monthlyCompensation);
  const eeRate = monthlyCompensation <= t.lowThreshold ? t.eeRateLow : t.eeRateHigh;
  return { ee: Math.round(base * eeRate), er: Math.round(base * t.erRate) };
}

export function withholdingTax(taxable: number, brackets: TaxBracket[]) {
  if (taxable <= 0) return 0;
  let chosen = brackets[0]!;
  for (const br of brackets) if (taxable > br.over) chosen = br;
  return Math.round(chosen.base + (taxable - chosen.over) * chosen.rate);
}

/** Annual income tax under TRAIN (2023 onward), used for year-end annualization. */
export const ANNUAL_TAX_2023: TaxBracket[] = [
  b(0, 0, 0),
  b(250_000_00, 0, 0.15),
  b(400_000_00, 22_500_00, 0.2),
  b(800_000_00, 102_500_00, 0.25),
  b(2_000_000_00, 402_500_00, 0.3),
  b(8_000_000_00, 2_202_500_00, 0.35),
];

/**
 * Day types and DOLE pay multipliers (Labor Code arts. 87, 93, 94; DOLE holiday pay rules).
 * Multipliers apply to the employee's hourly rate. Night differential adds 10% of the
 * applicable hourly rate for work between 10 PM and 6 AM.
 */

export const DAY_TYPES = [
  "ORDINARY",
  "REST",
  "SPECIAL",
  "SPECIAL_REST",
  "REGULAR",
  "REGULAR_REST",
  "DOUBLE",
  "DOUBLE_REST",
] as const;

export type DayType = (typeof DAY_TYPES)[number];

export type PremiumTable = {
  multipliers: Record<DayType, { regular: number; overtime: number }>;
  nightDiffRate: number;
};

export const PREMIUMS_DOLE: PremiumTable = {
  multipliers: {
    ORDINARY: { regular: 1.0, overtime: 1.25 },
    REST: { regular: 1.3, overtime: 1.69 },
    SPECIAL: { regular: 1.3, overtime: 1.69 },
    SPECIAL_REST: { regular: 1.5, overtime: 1.95 },
    REGULAR: { regular: 2.0, overtime: 2.6 },
    REGULAR_REST: { regular: 2.6, overtime: 3.38 },
    DOUBLE: { regular: 3.0, overtime: 3.9 },
    DOUBLE_REST: { regular: 3.9, overtime: 5.07 },
  },
  nightDiffRate: 0.1,
};

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  ORDINARY: "Ordinary day",
  REST: "Rest day",
  SPECIAL: "Special non-working day",
  SPECIAL_REST: "Special day on rest day",
  REGULAR: "Regular holiday",
  REGULAR_REST: "Regular holiday on rest day",
  DOUBLE: "Double holiday",
  DOUBLE_REST: "Double holiday on rest day",
};

export type HolidayKind = "REGULAR" | "SPECIAL_NON_WORKING" | "SPECIAL_WORKING";

export function classifyDay(holidays: HolidayKind[], isRestDay: boolean): DayType {
  const regular = holidays.filter((h) => h === "REGULAR").length;
  const special = holidays.some((h) => h === "SPECIAL_NON_WORKING");
  let base: "ORDINARY" | "SPECIAL" | "REGULAR" | "DOUBLE" = "ORDINARY";
  if (regular >= 2) base = "DOUBLE";
  else if (regular === 1) base = "REGULAR";
  else if (special) base = "SPECIAL";
  if (!isRestDay) return base;
  return base === "ORDINARY" ? "REST" : (`${base}_REST` as DayType);
}

export function isHolidayType(t: DayType) {
  return t !== "ORDINARY" && t !== "REST";
}

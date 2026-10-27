import type { Plan } from "@/generated/prisma/enums";

/** Feature flags gated by plan. */
export type Feature =
  | "clock"
  | "basicSchedule"
  | "timesheets"
  | "csvExport"
  | "geofence"
  | "kiosk"
  | "recurringShifts"
  | "openShifts"
  | "shiftSwaps"
  | "availability"
  | "autoSchedule"
  | "leave"
  | "overtime"
  | "approvals"
  | "exceptions"
  | "notifications"
  | "multiLocation"
  | "deviceLock"
  | "ipLock"
  | "photoProof"
  | "compliance"
  | "payroll"
  | "insights"
  | "api"
  | "attendanceReports"
  | "biometricDevices"
  | "rfid"
  | "multiLevelApproval"
  | "hrRoles"
  | "regions"
  | "fieldMode"
  | "webhooks"
  | "exportTemplates"
  | "consolidatedReports";

export type PlanConfig = {
  id: Plan;
  name: string;
  tagline: string;
  /** Monthly base price in centavos, covering `includedSeats` people. */
  monthlyBaseCentavos: number;
  includedSeats: number;
  /** Price per person beyond includedSeats, per month, in centavos. */
  extraSeatCentavos: number;
  /** Hard cap on active people (null = unlimited, billed per seat). */
  maxSeats: number | null;
  maxLocations: number | null;
  features: Feature[];
  highlights: string[];
  /** Priced per quote and invoiced (no self-serve checkout). */
  quoteOnly?: boolean;
};

const FREE_FEATURES: Feature[] = ["clock", "basicSchedule", "timesheets", "csvExport"];

const STARTER_FEATURES: Feature[] = [
  ...FREE_FEATURES,
  "geofence",
  "kiosk",
  "recurringShifts",
  "openShifts",
  "shiftSwaps",
  "availability",
  "autoSchedule",
  "leave",
  "overtime",
  "approvals",
  "exceptions",
  "notifications",
  "attendanceReports",
];

const PRO_FEATURES: Feature[] = [
  ...STARTER_FEATURES,
  "multiLocation",
  "deviceLock",
  "ipLock",
  "photoProof",
  "compliance",
  "payroll",
  "insights",
  "api",
];

const ENTERPRISE_FEATURES: Feature[] = [
  ...PRO_FEATURES,
  "biometricDevices",
  "rfid",
  "multiLevelApproval",
  "hrRoles",
  "regions",
  "fieldMode",
  "webhooks",
  "exportTemplates",
  "consolidatedReports",
];

// Prices are placeholders pending confirmation; change them here only.
export const PLANS: Record<Plan, PlanConfig> = {
  FREE: {
    id: "FREE",
    name: "Free",
    tagline: "For you and one teammate",
    monthlyBaseCentavos: 0,
    includedSeats: 2,
    extraSeatCentavos: 0,
    maxSeats: 2,
    maxLocations: 1,
    features: FREE_FEATURES,
    highlights: [
      "GPS-stamped clock in/out",
      "Basic weekly schedule",
      "Timesheets & pay estimates",
      "CSV export",
    ],
  },
  STARTER: {
    id: "STARTER",
    name: "Starter",
    tagline: "Time clock + scheduling for one site",
    monthlyBaseCentavos: 49_900,
    includedSeats: 5,
    extraSeatCentavos: 9_900,
    maxSeats: null,
    maxLocations: 1,
    features: STARTER_FEATURES,
    highlights: [
      "Geofencing & auto clock-out",
      "Kiosk mode with PIN or QR badge",
      "Drag-and-drop schedules, open shifts & swaps",
      "Leave, overtime requests & approvals",
      "Exception inbox",
    ],
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    tagline: "Full Philippine payroll, every site",
    monthlyBaseCentavos: 99_900,
    includedSeats: 5,
    extraSeatCentavos: 19_900,
    maxSeats: null,
    maxLocations: null,
    features: PRO_FEATURES,
    highlights: [
      "Unlimited locations, each with its own geofence",
      "Payroll with SSS, PhilHealth, Pag-IBIG & BIR tax",
      "Payslips, 13th-month pay & holiday premiums",
      "Photo proof, device & IP locks",
      "Labor insights & API access",
    ],
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    tagline: "Nationwide timekeeping with biometric terminals",
    // Quoted per company; the super-admin assigns this plan and invoices it.
    monthlyBaseCentavos: 0,
    includedSeats: 0,
    extraSeatCentavos: 0,
    maxSeats: null,
    maxLocations: null,
    features: ENTERPRISE_FEATURES,
    quoteOnly: true,
    highlights: [
      "Fingerprint & RFID terminals synced to one employee record",
      "Regions, branches, HR and timekeeper roles",
      "Two-level approvals for OT, leave, schedules & corrections",
      "Cutoff DTR reports consolidated nationwide",
      "Field mode for drivers & sales, webhooks & payroll export templates",
    ],
  },
};

export const TRIAL_DAYS = 14;
/** Where Enterprise enquiries go. */
export const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL || "sales@clocktime.ph";
/** Annual billing discount, in percent. */
export const ANNUAL_DISCOUNT_PERCENT = 20;
/** Days a past-due company keeps paid features before dropping to Free. */
export const PAST_DUE_GRACE_DAYS = 7;

export function monthlyPriceCentavos(plan: Plan, seats: number) {
  const p = PLANS[plan];
  const extra = Math.max(0, seats - p.includedSeats);
  return p.monthlyBaseCentavos + extra * p.extraSeatCentavos;
}

export function annualPriceCentavos(plan: Plan, seats: number) {
  return Math.round(monthlyPriceCentavos(plan, seats) * 12 * (1 - ANNUAL_DISCOUNT_PERCENT / 100));
}

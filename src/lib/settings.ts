import { z } from "zod";

/** Per-company time, pay and policy settings, stored in Company.settings (JSON). */
export const companySettingsSchema = z.object({
  /** Round each punch to this many minutes (0 = exact). */
  roundingMinutes: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15)]).default(0),
  roundingMode: z.enum(["nearest", "down", "up"]).default("nearest"),
  /** Minutes after a shift's start before a punch counts as late. */
  lateGraceMinutes: z.number().int().min(0).max(120).default(5),
  /** When true, time before the scheduled start isn't paid unless approved as overtime. */
  clampEarlyClockIn: z.boolean().default(true),
  /** Standard unpaid meal period. */
  mealBreakMinutes: z.number().int().min(0).max(180).default(60),
  /** If no break was recorded on a shift longer than this, deduct the meal break automatically. */
  autoDeductBreakAfterMinutes: z.number().int().min(0).max(1440).default(300),
  autoDeductBreak: z.boolean().default(true),
  /** Breaks longer than mealBreakMinutes + this are flagged. */
  longBreakToleranceMinutes: z.number().int().min(0).max(120).default(15),
  /** Regular hours per day before overtime starts. */
  dailyRegularMinutes: z.number().int().min(60).max(720).default(480),
  /** Only count overtime that a manager approved. */
  overtimeRequiresApproval: z.boolean().default(true),
  /** Night differential window, minutes after local midnight (22:00–06:00 under the Labor Code). */
  nightDiffStartMinute: z
    .number()
    .int()
    .min(0)
    .max(1439)
    .default(22 * 60),
  nightDiffEndMinute: z
    .number()
    .int()
    .min(0)
    .max(1439)
    .default(6 * 60),
  /** Hours after clock-in before an open entry is flagged as a missed clock-out. */
  missedClockOutHours: z.number().int().min(4).max(36).default(14),
  /** Semi-monthly contribution schedule. */
  contributionSchedule: z.enum(["SPLIT", "SECOND_CUTOFF", "FIRST_CUTOFF"]).default("SPLIT"),
  /** Days after a cut-off ends that payday falls on. */
  payDateOffsetDays: z.number().int().min(0).max(31).default(5),
  unworkedRegularHolidayPaid: z.boolean().default(true),
  unworkedSpecialDayPaid: z.boolean().default(false),
  photoRetentionDays: z.number().int().min(7).max(3650).default(90),
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: z.union([z.literal(0), z.literal(1)]).default(1),
  requireGps: z.boolean().default(false),
});

export type CompanySettings = z.infer<typeof companySettingsSchema>;

export function parseSettings(raw: unknown): CompanySettings {
  const result = companySettingsSchema.safeParse(raw ?? {});
  return result.success ? result.data : companySettingsSchema.parse({});
}

export const DEFAULT_SETTINGS: CompanySettings = companySettingsSchema.parse({});

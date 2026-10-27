import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((v) => (v ? v : undefined));

export const employeeInputSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80).default(""),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.email("Enter a valid email").optional()),
  phone: optionalText,
  employeeNo: optionalText,
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]).default("EMPLOYEE"),
  payType: z.enum(["HOURLY", "DAILY", "MONTHLY"]).default("DAILY"),
  /** In pesos */
  rate: z.coerce.number().min(0, "Rate can't be negative").max(10_000_000).default(0),
  workDaysPerYear: z.coerce
    .number()
    .int()
    .refine((n) => [261, 313, 365].includes(n), "Use 261, 313 or 365")
    .default(313),
  isMinimumWageEarner: z.coerce.boolean().default(false),
  restDays: z.array(z.coerce.number().int().min(0).max(6)).default([0]),
  hireDate: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.iso.date("Use YYYY-MM-DD").optional()),
  departmentName: optionalText,
  positionName: optionalText,
  locationIds: z.array(z.string()).default([]),
  tin: optionalText,
  sss: optionalText,
  philhealth: optionalText,
  pagibig: optionalText,
  bankName: optionalText,
  bankAccount: optionalText,
});

export type EmployeeInput = z.infer<typeof employeeInputSchema>;

export const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits");

/** CSV columns accepted by the team import (header names are case-insensitive). */
export const CSV_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "employee_no",
  "role",
  "pay_type",
  "rate",
  "hire_date",
  "department",
  "position",
] as const;

export const MAX_IMPORT_ROWS = 200;

export function csvRowToInput(row: Record<string, string>): unknown {
  const get = (k: string) => {
    const key = Object.keys(row).find((h) => h.trim().toLowerCase().replace(/\s+/g, "_") === k);
    return key ? (row[key]?.trim() ?? "") : "";
  };
  return {
    firstName: get("first_name"),
    lastName: get("last_name"),
    email: get("email") || undefined,
    phone: get("phone") || undefined,
    employeeNo: get("employee_no") || undefined,
    role: (get("role") || "EMPLOYEE").toUpperCase(),
    payType: (get("pay_type") || "DAILY").toUpperCase(),
    rate: get("rate").replace(/[,₱\s]/g, "") || 0,
    hireDate: get("hire_date") || undefined,
    departmentName: get("department") || undefined,
    positionName: get("position") || undefined,
  };
}

import { z } from "zod";
import { utcDateToKey } from "@/lib/time";
import { ApiError, apiAppContext, apiRoute } from "@/server/api-auth";
import { addEmployee, archiveEmployee, restoreEmployee, updateEmployee } from "@/server/services/team";

const body = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().max(80).optional(),
  email: z.email().nullish(),
  phone: z.string().max(40).nullish(),
  role: z.enum(["EMPLOYEE", "MANAGER", "TIMEKEEPER", "HR"]).optional(),
  payType: z.enum(["HOURLY", "DAILY", "MONTHLY"]).optional(),
  /** In pesos */
  rate: z.number().min(0).max(10_000_000).optional(),
  department: z.string().max(120).nullish(),
  position: z.string().max(120).nullish(),
  /** Branch codes (Locations → Branch code) */
  branches: z.array(z.string().max(20)).optional(),
  hireDate: z.iso.date().nullish(),
  restDays: z.array(z.number().int().min(0).max(6)).optional(),
  deviceUserId: z.string().max(24).nullish(),
  cardNumber: z.string().max(40).optional(),
  fieldWork: z.boolean().optional(),
  roaming: z.boolean().optional(),
  /** true archives the person (left the company); false restores them */
  archived: z.boolean().optional(),
});

/**
 * Create or update an employee by employee number, e.g. from an HRIS. Fields left out keep their
 * current value. Government IDs and bank details are managed in ClockTime only.
 */
export const PUT = apiRoute<{ employeeNo: string }>("write", async (api, req, { employeeNo }) => {
  const b = body.parse(await req.json());
  const ctx = apiAppContext(api);
  const existing = await api.db.employee.findFirst({
    where: { employeeNo },
    include: { department: true, position: true, locations: true },
  });
  let locationIds: string[] | undefined;
  if (b.branches) {
    const locs = await api.db.location.findMany({
      where: { code: { in: b.branches.map((c) => c.toUpperCase()) } },
    });
    const missing = b.branches.filter((c) => !locs.some((l) => l.code === c.toUpperCase()));
    if (missing.length) throw new ApiError(422, `Unknown branch code(s): ${missing.join(", ")}`);
    locationIds = locs.map((l) => l.id);
  }
  const input = {
    firstName: b.firstName ?? existing?.firstName,
    lastName: b.lastName ?? existing?.lastName ?? "",
    email: b.email === undefined ? (existing?.email ?? undefined) : (b.email ?? undefined),
    phone: b.phone === undefined ? (existing?.phone ?? undefined) : (b.phone ?? undefined),
    employeeNo,
    role:
      b.role ??
      (existing?.role === "OWNER" || existing?.role === "ADMIN"
        ? existing.role
        : (existing?.role ?? "EMPLOYEE")),
    payType: b.payType ?? existing?.payType ?? "DAILY",
    rate: b.rate ?? (existing ? existing.rateCentavos / 100 : 0),
    workDaysPerYear: existing?.workDaysPerYear ?? 313,
    isMinimumWageEarner: existing?.isMinimumWageEarner ?? false,
    timeExempt: existing?.timeExempt ?? false,
    restDays: b.restDays ?? existing?.restDays ?? [0],
    hireDate:
      b.hireDate === undefined
        ? existing?.hireDate
          ? utcDateToKey(existing.hireDate)
          : undefined
        : (b.hireDate ?? undefined),
    departmentName: b.department === undefined ? existing?.department?.name : (b.department ?? undefined),
    positionName: b.position === undefined ? existing?.position?.name : (b.position ?? undefined),
    locationIds: locationIds ?? existing?.locations.map((l) => l.locationId) ?? [],
    bankName: existing?.bankName ?? undefined,
    deviceUserId:
      b.deviceUserId === undefined ? (existing?.deviceUserId ?? undefined) : (b.deviceUserId ?? undefined),
    cardNumber: b.cardNumber,
    fieldWork: b.fieldWork ?? existing?.fieldWork ?? false,
    roaming: b.roaming ?? existing?.roaming ?? false,
  };
  if (!input.firstName) throw new ApiError(422, "firstName is required for a new employee");
  let emp = existing
    ? await updateEmployee(ctx, existing.id, input)
    : await addEmployee(ctx, input, { sendInvite: false });
  if (b.archived === true && emp.status !== "ARCHIVED") {
    await archiveEmployee(ctx, emp.id);
    emp = { ...emp, status: "ARCHIVED" };
  } else if (b.archived === false && emp.status === "ARCHIVED") {
    await restoreEmployee(ctx, emp.id);
  }
  return { ok: true, created: !existing, id: emp.id, employeeNo: emp.employeeNo, status: emp.status };
});

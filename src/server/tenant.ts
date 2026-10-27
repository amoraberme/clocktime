import "server-only";
import { prisma } from "./db";

/** Models with a required companyId column. Holiday (nullable companyId) is scoped by hand. */
const TENANT_MODELS = new Set([
  "Location",
  "Region",
  "Department",
  "Position",
  "Employee",
  "Invitation",
  "Device",
  "TimeEntry",
  "Shift",
  "ShiftRecurrence",
  "ShiftSwapRequest",
  "Availability",
  "LeaveType",
  "LeaveBalance",
  "LeaveRequest",
  "OvertimeRequest",
  "TimeException",
  "Timesheet",
  "PayRun",
  "PayRunItem",
  "PayAdjustment",
  "Loan",
  "AuditLog",
  "Notification",
  "BillingInvoice",
  "ApiKey",
  "Punch",
  "ScheduleChangeRequest",
  "AttendanceCorrectionRequest",
  "ApprovalStep",
  "AttendanceDevice",
  "DeviceLog",
]);

const WHERE_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

type AnyArgs = Record<string, unknown> & { where?: object; data?: unknown; create?: object };

/**
 * A Prisma client that can only see and write rows of one company.
 * Every read/update/delete gets `companyId` added to its where clause and every
 * create gets `companyId` set, so a forgotten filter can't leak another tenant's data.
 * Relations must be written with scalar foreign keys (employeeId: …), not `connect`.
 */
export function tenantDb(companyId: string) {
  return prisma.$extends({
    name: "tenant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a = { ...(args as AnyArgs) };
          if (WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), companyId };
            if (a.data && typeof a.data === "object" && "companyId" in a.data) {
              // Rows can never be moved to another company.
              const { companyId: _ignored, ...rest } = a.data as Record<string, unknown>;
              a.data = rest;
            }
          } else if (operation === "create") {
            a.data = { ...(a.data as object), companyId };
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            a.data = Array.isArray(a.data)
              ? a.data.map((d: object) => ({ ...d, companyId }))
              : { ...(a.data as object), companyId };
          } else if (operation === "upsert") {
            a.where = { ...(a.where ?? {}), companyId };
            a.create = { ...(a.create ?? {}), companyId };
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;

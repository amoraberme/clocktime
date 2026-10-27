import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { UserError } from "./action";
import type { AppContext, Approval } from "./context";

type ScopeCtx = Pick<AppContext, "managedLocationIds"> & Partial<Pick<AppContext, "managedDepartmentIds">>;

/** Employees the signed-in user may see and act on. Empty for nationwide roles. */
export function employeeScopeWhere(ctx: ScopeCtx): Prisma.EmployeeWhereInput {
  return {
    ...(ctx.managedLocationIds
      ? { locations: { some: { locationId: { in: ctx.managedLocationIds } } } }
      : {}),
    ...(ctx.managedDepartmentIds ? { departmentId: { in: ctx.managedDepartmentIds } } : {}),
  };
}

export function isScoped(ctx: ScopeCtx) {
  return !!ctx.managedLocationIds || !!ctx.managedDepartmentIds;
}

/** Throws unless the employee is within the user's branches. */
export async function assertEmployeeInScope(ctx: ScopeCtx & Pick<AppContext, "db">, employeeId: string) {
  if (!isScoped(ctx)) return;
  const found = await ctx.db.employee.count({ where: { id: employeeId, ...employeeScopeWhere(ctx) } });
  if (!found) throw new UserError("That person isn't in the branches you manage.");
}

/** Throws unless the user's role may approve this kind of request. */
export function assertApprover(ctx: Pick<AppContext, "approves">, kind: Approval) {
  if (!ctx.approves(kind)) throw new UserError("Your role can't approve this kind of request.");
}

/** Only the owner may approve their own requests (single-person businesses). */
export function assertNotSelf(ctx: Pick<AppContext, "employee" | "role">, employeeId: string, what: string) {
  if (employeeId === ctx.employee.id && ctx.role !== "OWNER")
    throw new UserError(`Someone else needs to approve your own ${what}.`);
}

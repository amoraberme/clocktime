import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { UserError } from "./action";
import type { AppContext } from "./context";

type ScopeCtx = Pick<AppContext, "managedLocationIds">;

/** Employees the signed-in user may see and act on. Empty for nationwide roles. */
export function employeeScopeWhere(ctx: ScopeCtx): Prisma.EmployeeWhereInput {
  return ctx.managedLocationIds
    ? { locations: { some: { locationId: { in: ctx.managedLocationIds } } } }
    : {};
}

/** Throws unless the employee is within the user's branches. */
export async function assertEmployeeInScope(
  ctx: Pick<AppContext, "managedLocationIds" | "db">,
  employeeId: string,
) {
  if (!ctx.managedLocationIds) return;
  const found = await ctx.db.employee.count({ where: { id: employeeId, ...employeeScopeWhere(ctx) } });
  if (!found) throw new UserError("That person isn't in the branches you manage.");
}

/** Only the owner may approve their own requests (single-person businesses). */
export function assertNotSelf(ctx: Pick<AppContext, "employee" | "role">, employeeId: string, what: string) {
  if (employeeId === ctx.employee.id && ctx.role !== "OWNER")
    throw new UserError(`Someone else needs to approve your own ${what}.`);
}

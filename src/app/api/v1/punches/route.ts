import { z } from "zod";
import { ApiError, apiRoute } from "@/server/api-auth";
import { afterPunch } from "@/server/services/punch-hooks";
import { punch } from "@/server/services/timeclock";

const body = z
  .object({
    employeeId: z.string().optional(),
    employeeNo: z.string().optional(),
    action: z.enum(["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"]),
    at: z.iso.datetime({ offset: true }).optional(),
    clientId: z.uuid().optional(),
    locationId: z.string().optional(),
  })
  .refine((b) => b.employeeId || b.employeeNo, "Provide employeeId or employeeNo");

/** Record a punch from another system (biometric terminal, access control, POS). Idempotent per clientId. */
export const POST = apiRoute("punch", async (ctx, req) => {
  const b = body.parse(await req.json());
  const emp = await ctx.db.employee.findFirst({
    where: b.employeeId ? { id: b.employeeId } : { employeeNo: b.employeeNo },
  });
  if (!emp || emp.status === "ARCHIVED") throw new ApiError(404, "Employee not found");
  const r = await punch(
    {
      companyId: ctx.company.id,
      timezone: ctx.company.timezone,
      plan: ctx.plan,
      settings: ctx.settings,
      employee: emp,
    },
    {
      action: b.action,
      at: b.at ? new Date(b.at) : undefined,
      offline: !!b.at,
      clientId: b.clientId,
      source: "API",
      locationId: b.locationId,
      kioskLocationId: b.locationId,
    },
  );
  await afterPunch(ctx.company.id, emp.id, r.entryId);
  return { ok: true, timeEntryId: r.entryId, action: r.action, at: r.at };
});

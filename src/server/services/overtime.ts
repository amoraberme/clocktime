import "server-only";
import { z } from "zod";
import { formatKey, keyToUtcDate, utcDateToKey } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import { requireFeature, type AppContext } from "../context";
import { assertEmployeeInScope, assertNotSelf } from "../scope";
import { notify, notifyManagers } from "./notifications";

const requestSchema = z.object({
  date: z.iso.date(),
  minutes: z.coerce
    .number()
    .int()
    .min(15, "At least 15 minutes")
    .max(16 * 60),
  reason: z.string().trim().min(3, "Add a short reason").max(300),
});

export async function requestOvertime(ctx: AppContext, raw: unknown) {
  requireFeature(ctx, "overtime");
  const input = requestSchema.parse(raw);
  const req = await ctx.db.overtimeRequest.create({
    data: {
      companyId: ctx.company.id,
      employeeId: ctx.employee.id,
      date: keyToUtcDate(input.date),
      minutes: input.minutes,
      reason: input.reason,
    },
  });
  await writeAudit(actorFrom(ctx), {
    action: "overtime.request",
    entityType: "OvertimeRequest",
    entityId: req.id,
    after: { date: input.date, minutes: input.minutes, reason: input.reason },
  });
  await notifyManagers(ctx.company.id, ctx.employee.id, {
    kind: "overtime.request",
    title: `${fullName(ctx.employee)} requested overtime`,
    body: `${Math.round(input.minutes / 6) / 10}h on ${formatKey(input.date)}: ${input.reason}`,
    url: "/app/exceptions?tab=overtime",
  });
  return req;
}

/** Managers approve (optionally adjusting minutes) or decline; can also pre-approve for someone. */
export async function decideOvertime(ctx: AppContext, id: string, approve: boolean, minutes?: number) {
  requireFeature(ctx, "overtime");
  const req = await ctx.db.overtimeRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") throw new UserError("Request not found or already decided.");
  assertNotSelf(ctx, req.employeeId, "overtime");
  await assertEmployeeInScope(ctx, req.employeeId);
  await ctx.db.overtimeRequest.update({
    where: { id },
    data: {
      status: approve ? "APPROVED" : "DECLINED",
      minutes: approve && minutes ? minutes : req.minutes,
      decidedById: ctx.employee.id,
      decidedAt: new Date(),
    },
  });
  await writeAudit(actorFrom(ctx), {
    action: approve ? "overtime.approve" : "overtime.decline",
    entityType: "OvertimeRequest",
    entityId: id,
    after: { minutes: minutes ?? req.minutes },
  });
  await notify(ctx.company.id, req.employeeId, {
    kind: "overtime.decided",
    title: approve ? "Overtime approved" : "Overtime declined",
    body: formatKey(utcDateToKey(req.date)),
    url: "/me/timesheet",
  });
}

export async function approveOvertimeFor(
  ctx: AppContext,
  employeeId: string,
  date: string,
  minutes: number,
  reason = "Approved by manager",
) {
  requireFeature(ctx, "overtime");
  const emp = await ctx.db.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw new UserError("Employee not found.");
  assertNotSelf(ctx, employeeId, "overtime");
  await assertEmployeeInScope(ctx, employeeId);
  const r = await ctx.db.overtimeRequest.create({
    data: {
      companyId: ctx.company.id,
      employeeId,
      date: keyToUtcDate(date),
      minutes,
      reason,
      status: "APPROVED",
      decidedById: ctx.employee.id,
      decidedAt: new Date(),
    },
  });
  await writeAudit(actorFrom(ctx), {
    action: "overtime.preapprove",
    entityType: "OvertimeRequest",
    entityId: r.id,
    after: { employeeId, date, minutes },
  });
  return r;
}

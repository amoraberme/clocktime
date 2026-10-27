import "server-only";
import { z } from "zod";
import type { Employee } from "@/generated/prisma/client";
import { addDays, dateKey, eachDay, formatKey, keyToUtcDate, utcDateToKey, weekday } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import { requireFeature, type AppContext } from "../context";
import { prisma } from "../db";
import { assertEmployeeInScope, assertNotSelf } from "../scope";
import { notify, notifyManagers } from "./notifications";
import { loadHolidays } from "./timesheets";

/** SIL (Labor Code art. 95): 5 days per year once the employee has rendered at least one year of service. */
export function silEligible(hireDate: Date | null, asOf: string) {
  if (!hireDate) return false;
  return addDays(utcDateToKey(hireDate), 365) <= asOf;
}

export async function leaveBalances(
  ctx: AppContext,
  employee: Pick<Employee, "id" | "hireDate">,
  year: number,
) {
  const today = dateKey(new Date(), ctx.company.timezone);
  const [types, stored, used] = await Promise.all([
    ctx.db.leaveType.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    ctx.db.leaveBalance.findMany({ where: { employeeId: employee.id, year } }),
    ctx.db.leaveRequest.groupBy({
      by: ["leaveTypeId"],
      where: {
        employeeId: employee.id,
        status: "APPROVED",
        startDate: { gte: keyToUtcDate(`${year}-01-01`), lte: keyToUtcDate(`${year}-12-31`) },
      },
      _sum: { days: true },
    }),
  ]);
  return types.map((t) => {
    const override = stored.find((s) => s.leaveTypeId === t.id);
    const entitled =
      override?.entitled ??
      (t.isSil ? (silEligible(employee.hireDate, today) ? t.annualDays : 0) : t.annualDays);
    const usedDays = used.find((u) => u.leaveTypeId === t.id)?._sum.days ?? 0;
    return {
      type: t,
      entitled,
      used: usedDays,
      remaining: t.annualDays === 0 && !override ? null : entitled - usedDays,
    };
  });
}

const requestSchema = z.object({
  leaveTypeId: z.string().min(1, "Choose a leave type"),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  halfDay: z.boolean().default(false),
  reason: z.string().trim().max(300).optional(),
});

/** Working days in a range for one employee: skips rest days and holidays. */
async function countDays(ctx: AppContext, emp: Pick<Employee, "restDays">, start: string, end: string) {
  const holidays = await loadHolidays(ctx.company.id, start, end);
  return eachDay(start, end).filter(
    (d) =>
      !emp.restDays.includes(weekday(d)) && !(holidays.get(d) ?? []).some((h) => h !== "SPECIAL_WORKING"),
  ).length;
}

export async function requestLeave(ctx: AppContext, raw: unknown, forEmployeeId?: string) {
  requireFeature(ctx, "leave");
  const input = requestSchema.parse(raw);
  if (input.endDate < input.startDate) throw new UserError("The end date is before the start date.");
  if (input.halfDay && input.startDate !== input.endDate)
    throw new UserError("Half days must be a single date.");
  const employeeId = forEmployeeId ?? ctx.employee.id;
  if (forEmployeeId && !ctx.isManager) throw new UserError("Not allowed.");
  const emp = await ctx.db.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw new UserError("Employee not found.");
  const type = await ctx.db.leaveType.findUnique({ where: { id: input.leaveTypeId } });
  if (!type || type.archivedAt) throw new UserError("Leave type not found.");
  let days = await countDays(ctx, emp, input.startDate, input.endDate);
  if (days === 0) throw new UserError("Those dates are all rest days or holidays.");
  if (input.halfDay) days = 0.5;
  const overlap = await ctx.db.leaveRequest.findFirst({
    where: {
      employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: keyToUtcDate(input.endDate) },
      endDate: { gte: keyToUtcDate(input.startDate) },
    },
  });
  if (overlap) throw new UserError("You already have leave on some of those dates.");
  const year = Number(input.startDate.slice(0, 4));
  const balance = (await leaveBalances(ctx, emp, year)).find((b) => b.type.id === type.id);
  if (type.paid && balance?.remaining != null && balance.remaining < days) {
    throw new UserError(`Not enough ${type.name}: ${balance.remaining} day(s) left, ${days} requested.`);
  }
  const autoApprove = !!forEmployeeId;
  const req = await ctx.db.leaveRequest.create({
    data: {
      companyId: ctx.company.id,
      employeeId,
      leaveTypeId: type.id,
      startDate: keyToUtcDate(input.startDate),
      endDate: keyToUtcDate(input.endDate),
      days,
      reason: input.reason,
      status: autoApprove ? "APPROVED" : "PENDING",
      decidedById: autoApprove ? ctx.employee.id : null,
      decidedAt: autoApprove ? new Date() : null,
    },
  });
  await writeAudit(actorFrom(ctx), {
    action: autoApprove ? "leave.record" : "leave.request",
    entityType: "LeaveRequest",
    entityId: req.id,
    after: { ...input, days },
  });
  if (!autoApprove) {
    await notifyManagers(ctx.company.id, employeeId, {
      kind: "leave.request",
      title: `${fullName(emp)} requested ${type.name}`,
      body: `${formatKey(input.startDate)}${input.endDate !== input.startDate ? ` – ${formatKey(input.endDate)}` : ""} (${days} day${days === 1 ? "" : "s"})`,
      url: "/app/leave",
    });
  }
  return req;
}

export async function decideLeave(ctx: AppContext, id: string, approve: boolean, note?: string) {
  requireFeature(ctx, "leave");
  const req = await ctx.db.leaveRequest.findUnique({ where: { id }, include: { leaveType: true } });
  if (!req || req.status !== "PENDING") throw new UserError("Request not found or already decided.");
  assertNotSelf(ctx, req.employeeId, "leave");
  await assertEmployeeInScope(ctx, req.employeeId);
  await ctx.db.leaveRequest.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "DECLINED", decidedById: ctx.employee.id, decidedAt: new Date() },
  });
  await writeAudit(actorFrom(ctx), {
    action: approve ? "leave.approve" : "leave.decline",
    entityType: "LeaveRequest",
    entityId: id,
    reason: note,
  });
  await notify(ctx.company.id, req.employeeId, {
    kind: "leave.decided",
    title: `${req.leaveType.name} ${approve ? "approved" : "declined"}`,
    body: `${formatKey(utcDateToKey(req.startDate))}${req.endDate.getTime() !== req.startDate.getTime() ? ` – ${formatKey(utcDateToKey(req.endDate))}` : ""}${note ? `. ${note}` : ""}`,
    url: "/me/leave",
    email: true,
  });
}

export async function cancelLeave(ctx: AppContext, id: string) {
  const req = await ctx.db.leaveRequest.findUnique({ where: { id } });
  if (!req) throw new UserError("Request not found.");
  const own = req.employeeId === ctx.employee.id;
  if (!own && !ctx.isManager) throw new UserError("Not allowed.");
  if (
    own &&
    req.status === "APPROVED" &&
    utcDateToKey(req.startDate) <= dateKey(new Date(), ctx.company.timezone)
  ) {
    throw new UserError("This leave has started. Ask your manager to change it.");
  }
  if (!["PENDING", "APPROVED"].includes(req.status)) throw new UserError("This request can't be canceled.");
  await ctx.db.leaveRequest.update({ where: { id }, data: { status: "CANCELED" } });
  await writeAudit(actorFrom(ctx), { action: "leave.cancel", entityType: "LeaveRequest", entityId: id });
}

const typeSchema = z.object({
  name: z.string().trim().min(2).max(60),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,6}$/, "Use up to 6 letters/numbers"),
  paid: z.boolean(),
  annualDays: z.number().min(0).max(365),
});

export async function createLeaveType(ctx: AppContext, raw: unknown) {
  requireFeature(ctx, "leave");
  const input = typeSchema.parse(raw);
  if (await ctx.db.leaveType.findFirst({ where: { code: input.code } }))
    throw new UserError("That code is already used.");
  return ctx.db.leaveType.create({ data: { ...input, companyId: ctx.company.id } });
}

export async function setEntitlement(
  ctx: AppContext,
  employeeId: string,
  leaveTypeId: string,
  year: number,
  entitled: number,
) {
  requireFeature(ctx, "leave");
  if (!(await ctx.db.employee.findUnique({ where: { id: employeeId } })))
    throw new UserError("Employee not found.");
  await prisma.leaveBalance.upsert({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    create: { companyId: ctx.company.id, employeeId, leaveTypeId, year, entitled },
    update: { entitled },
  });
  await writeAudit(actorFrom(ctx), {
    action: "leave.entitlement",
    entityType: "LeaveBalance",
    entityId: `${employeeId}:${leaveTypeId}:${year}`,
    after: { entitled },
  });
}

import "server-only";
import { z } from "zod";
import { dateKey, keyToUtcDate, parseLocalDateTime } from "@/lib/time";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import type { AppContext } from "../context";
import { prisma } from "../db";
import { requireFeature } from "../context";
import { periodBounds } from "./timesheets";

export const entryEditSchema = z.object({
  clockIn: z.string().min(1, "Clock-in time is required"),
  clockOut: z.string().optional(),
  locationId: z.string().optional(),
  breaks: z.array(z.object({ start: z.string(), end: z.string() })).default([]),
  notes: z.string().max(500).optional(),
  reason: z.string().trim().min(3, "Give a reason for the change (kept in the audit trail)").max(300),
});

export type EntryEdit = z.infer<typeof entryEditSchema>;

function snapshot(e: {
  clockInAt: Date;
  clockOutAt: Date | null;
  locationId: string | null;
  breaks: { startAt: Date; endAt: Date | null }[];
}) {
  return {
    clockInAt: e.clockInAt.toISOString(),
    clockOutAt: e.clockOutAt?.toISOString() ?? null,
    locationId: e.locationId,
    breaks: e.breaks.map((b) => [b.startAt.toISOString(), b.endAt?.toISOString() ?? null]),
  };
}

function parseEdit(ctx: AppContext, input: EntryEdit) {
  const tz = ctx.company.timezone;
  const clockInAt = parseLocalDateTime(input.clockIn, tz);
  const clockOutAt = input.clockOut ? parseLocalDateTime(input.clockOut, tz) : null;
  if (clockOutAt && clockOutAt <= clockInAt) throw new UserError("Clock-out must be after clock-in.");
  if (clockOutAt && clockOutAt.getTime() - clockInAt.getTime() > 24 * 3600_000)
    throw new UserError("An entry can't be longer than 24 hours.");
  if (clockInAt.getTime() > Date.now() + 60_000) throw new UserError("Clock-in can't be in the future.");
  const breaks = input.breaks
    .filter((b) => b.start && b.end)
    .map((b) => ({ startAt: parseLocalDateTime(b.start, tz), endAt: parseLocalDateTime(b.end, tz) }));
  for (const b of breaks) {
    if (b.endAt <= b.startAt) throw new UserError("Each break must end after it starts.");
    if (b.startAt < clockInAt || (clockOutAt && b.endAt > clockOutAt))
      throw new UserError("Breaks must be within the shift.");
  }
  return { clockInAt, clockOutAt, breaks };
}

async function assertEditable(ctx: AppContext, employeeId: string, at: Date) {
  const emp = await ctx.db.employee.findUnique({ where: { id: employeeId }, include: { locations: true } });
  if (!emp) throw new UserError("Employee not found.");
  if (ctx.managedLocationIds && !emp.locations.some((l) => ctx.managedLocationIds!.includes(l.locationId))) {
    throw new UserError("You can only edit people at locations you manage.");
  }
  if (!ctx.isManager && emp.id !== ctx.employee.id) throw new UserError("Not allowed.");
  const day = keyToUtcDate(dateKey(at, ctx.company.timezone));
  const locked = await ctx.db.timesheet.findFirst({
    where: { employeeId, status: "LOCKED", periodStart: { lte: day }, periodEnd: { gte: day } },
  });
  if (locked) throw new UserError("This pay period is locked by a finalized payroll run.");
  return emp;
}

async function assertNoOverlap(
  employeeId: string,
  companyId: string,
  start: Date,
  end: Date | null,
  excludeId?: string,
) {
  const overlap = await prisma.timeEntry.findFirst({
    where: {
      companyId,
      employeeId,
      id: excludeId ? { not: excludeId } : undefined,
      clockInAt: { lt: end ?? new Date(8.64e15) },
      OR: [{ clockOutAt: null }, { clockOutAt: { gt: start } }],
    },
  });
  if (overlap) throw new UserError("This overlaps another time entry for the same person.");
}

export async function editTimeEntry(ctx: AppContext, entryId: string, raw: unknown) {
  const input = entryEditSchema.parse(raw);
  const before = await ctx.db.timeEntry.findUnique({ where: { id: entryId }, include: { breaks: true } });
  if (!before) throw new UserError("Time entry not found.");
  if (before.status === "LOCKED") throw new UserError("This entry is locked by a finalized payroll run.");
  await assertEditable(ctx, before.employeeId, before.clockInAt);
  const { clockInAt, clockOutAt, breaks } = parseEdit(ctx, input);
  await assertNoOverlap(before.employeeId, ctx.company.id, clockInAt, clockOutAt, entryId);
  const after = await prisma.$transaction(async (tx) => {
    await tx.break.deleteMany({ where: { timeEntryId: entryId } });
    if (breaks.length)
      await tx.break.createMany({ data: breaks.map((b) => ({ ...b, timeEntryId: entryId, paid: false })) });
    return tx.timeEntry.update({
      where: { id: entryId },
      data: {
        clockInAt,
        clockOutAt,
        locationId: input.locationId || before.locationId,
        notes: input.notes ?? before.notes,
        status: clockOutAt ? "CLOSED" : "OPEN",
        outSource: clockOutAt && !before.clockOutAt ? "MANUAL" : before.outSource,
        approvedAt: null,
        approvedById: null,
      },
      include: { breaks: true },
    });
  });
  await writeAudit(actorFrom(ctx), {
    action: "timeEntry.edit",
    entityType: "TimeEntry",
    entityId: entryId,
    before: snapshot(before),
    after: snapshot(after),
    reason: input.reason,
  });
  return after;
}

export async function addManualEntry(ctx: AppContext, employeeId: string, raw: unknown) {
  const input = entryEditSchema.parse(raw);
  const { clockInAt, clockOutAt, breaks } = parseEdit(ctx, input);
  await assertEditable(ctx, employeeId, clockInAt);
  await assertNoOverlap(employeeId, ctx.company.id, clockInAt, clockOutAt);
  const entry = await prisma.timeEntry.create({
    data: {
      companyId: ctx.company.id,
      employeeId,
      clockInAt,
      clockOutAt,
      locationId: input.locationId || null,
      inSource: "MANUAL",
      outSource: clockOutAt ? "MANUAL" : null,
      status: clockOutAt ? "CLOSED" : "OPEN",
      notes: input.notes,
      breaks: { create: breaks.map((b) => ({ ...b, paid: false })) },
    },
    include: { breaks: true },
  });
  await writeAudit(actorFrom(ctx), {
    action: "timeEntry.create",
    entityType: "TimeEntry",
    entityId: entry.id,
    after: snapshot(entry),
    reason: input.reason,
  });
  return entry;
}

export async function deleteTimeEntry(ctx: AppContext, entryId: string, reason: string) {
  if (reason.trim().length < 3) throw new UserError("Give a reason for deleting this entry.");
  const before = await ctx.db.timeEntry.findUnique({ where: { id: entryId }, include: { breaks: true } });
  if (!before) throw new UserError("Time entry not found.");
  if (before.status === "LOCKED") throw new UserError("This entry is locked by a finalized payroll run.");
  await assertEditable(ctx, before.employeeId, before.clockInAt);
  await ctx.db.timeEntry.delete({ where: { id: entryId } });
  await writeAudit(actorFrom(ctx), {
    action: "timeEntry.delete",
    entityType: "TimeEntry",
    entityId: entryId,
    before: snapshot(before),
    reason,
  });
}

export async function setTimesheetApproval(
  ctx: AppContext,
  employeeIds: string[],
  period: { start: string; end: string },
  approve: boolean,
) {
  requireFeature(ctx, "approvals");
  const bounds = periodBounds(period.start, period.end, ctx.company.timezone);
  const results = { approved: 0, skipped: 0 };
  for (const employeeId of employeeIds) {
    const existing = await ctx.db.timesheet.findUnique({
      where: { employeeId_periodStart: { employeeId, periodStart: keyToUtcDate(period.start) } },
    });
    if (existing?.status === "LOCKED") {
      results.skipped++;
      continue;
    }
    const open = await ctx.db.timeEntry.count({ where: { employeeId, clockInAt: bounds, clockOutAt: null } });
    if (approve && open > 0) {
      results.skipped++;
      continue;
    }
    await prisma.timesheet.upsert({
      where: { employeeId_periodStart: { employeeId, periodStart: keyToUtcDate(period.start) } },
      create: {
        companyId: ctx.company.id,
        employeeId,
        periodStart: keyToUtcDate(period.start),
        periodEnd: keyToUtcDate(period.end),
        status: approve ? "APPROVED" : "PENDING",
        approvedById: approve ? ctx.employee.id : null,
        approvedAt: approve ? new Date() : null,
      },
      update: {
        status: approve ? "APPROVED" : "PENDING",
        approvedById: approve ? ctx.employee.id : null,
        approvedAt: approve ? new Date() : null,
      },
    });
    await ctx.db.timeEntry.updateMany({
      where: { employeeId, clockInAt: bounds, status: { in: approve ? ["CLOSED"] : ["APPROVED"] } },
      data: approve
        ? { status: "APPROVED", approvedAt: new Date(), approvedById: ctx.employee.id }
        : { status: "CLOSED", approvedAt: null, approvedById: null },
    });
    await writeAudit(actorFrom(ctx), {
      action: approve ? "timesheet.approve" : "timesheet.unapprove",
      entityType: "Timesheet",
      entityId: `${employeeId}:${period.start}`,
    });
    results.approved++;
  }
  return results;
}

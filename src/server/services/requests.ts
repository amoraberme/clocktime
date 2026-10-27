import "server-only";
import { z } from "zod";
import type { CorrectionKind } from "@/generated/prisma/enums";
import {
  atMinute,
  dateKey,
  formatDateTime,
  formatKey,
  keyToUtcDate,
  parseHHMM,
  parseLocalDateTime,
  toHHMM,
  utcDateToKey,
} from "@/lib/time";
import { fullName } from "@/lib/utils";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import { requireFeature, type AppContext } from "../context";
import { prisma } from "../db";
import { assertEmployeeInScope } from "../scope";
import { recordDecision } from "./approvals";
import { rebuildForSchedule } from "./attendance/relink";
import { notify, notifyManagers } from "./notifications";
import { assertPeriodOpen, punch } from "./timeclock";

// ───────────── Schedule change requests ─────────────

const scheduleSchema = z
  .object({
    kind: z.enum(["CHANGE", "ADD", "REMOVE"]),
    shiftId: z.string().nullish(),
    date: z.iso.date(),
    start: z
      .string()
      .regex(/^\d{1,2}:\d{2}$/)
      .nullish(),
    end: z
      .string()
      .regex(/^\d{1,2}:\d{2}$/)
      .nullish(),
    locationId: z.string().nullish(),
    reason: z.string().trim().min(3, "Give a reason").max(500),
  })
  .refine((v) => v.kind === "ADD" || !!v.shiftId, {
    message: "Choose the shift to change",
    path: ["shiftId"],
  })
  .refine((v) => v.kind === "REMOVE" || (!!v.start && !!v.end), {
    message: "Enter the new start and end times",
    path: ["start"],
  });

/** Whose request this is: your own, or (for a supervisor) someone you manage. */
async function subjectOf(ctx: AppContext, forEmployeeId?: string | null) {
  const employeeId = forEmployeeId || ctx.employee.id;
  if (employeeId !== ctx.employee.id) {
    if (!ctx.isManager) throw new UserError("Not allowed.");
    await assertEmployeeInScope(ctx, employeeId);
  }
  const emp = await ctx.db.employee.findUnique({ where: { id: employeeId }, include: { locations: true } });
  if (!emp || emp.status === "ARCHIVED") throw new UserError("Employee not found.");
  return emp;
}

export async function requestScheduleChange(ctx: AppContext, raw: unknown, forEmployeeId?: string | null) {
  requireFeature(ctx, "approvals");
  const input = scheduleSchema.parse(raw);
  const emp = await subjectOf(ctx, forEmployeeId);
  const shift = input.shiftId
    ? await ctx.db.shift.findFirst({ where: { id: input.shiftId, employeeId: emp.id } })
    : null;
  if (input.shiftId && !shift) throw new UserError("That shift isn't on this person's schedule.");
  let startMinute: number | null = null;
  let duration: number | null = null;
  if (input.kind !== "REMOVE") {
    startMinute = parseHHMM(input.start!);
    let end = parseHHMM(input.end!);
    if (end <= startMinute) end += 1440;
    duration = end - startMinute;
    if (duration > ctx.settings.maxShiftHours * 60)
      throw new UserError(`A shift can't be longer than ${ctx.settings.maxShiftHours} hours.`);
  }
  const locationId = input.locationId || shift?.locationId || emp.locations[0]?.locationId || null;
  if (input.kind !== "REMOVE" && !locationId) throw new UserError("Choose a branch for the shift.");
  if (locationId && !(await ctx.db.location.findUnique({ where: { id: locationId } })))
    throw new UserError("Branch not found.");
  const req = await ctx.db.scheduleChangeRequest.create({
    data: {
      companyId: ctx.company.id,
      employeeId: emp.id,
      kind: input.kind,
      shiftId: shift?.id ?? null,
      date: keyToUtcDate(shift ? dateKey(shift.startAt, ctx.company.timezone) : input.date),
      startMinute,
      durationMinutes: duration,
      locationId,
      reason: input.reason,
      filedById: ctx.employee.id,
    },
  });
  await writeAudit(actorFrom(ctx), {
    action: "schedule.request",
    entityType: "ScheduleChangeRequest",
    entityId: req.id,
    after: { ...input, employeeId: emp.id },
  });
  await notifyManagers(ctx.company.id, emp.id, {
    kind: "schedule.request",
    title: `${fullName(emp)} requested a schedule change`,
    body: `${formatKey(input.date)}: ${describeSchedule(req)}`,
    url: "/app/approvals",
  });
  return req;
}

export function describeSchedule(r: {
  kind: string;
  startMinute: number | null;
  durationMinutes: number | null;
}) {
  if (r.kind === "REMOVE") return "Remove the shift (day off)";
  const span = `${toHHMM(r.startMinute!)}–${toHHMM((r.startMinute! + r.durationMinutes!) % 1440)}`;
  return r.kind === "ADD" ? `Add a duty ${span}` : `Move the shift to ${span}`;
}

/** Approve or decline; a final approval updates the schedule and re-pairs the attendance. */
export async function decideScheduleChange(ctx: AppContext, id: string, approve: boolean, note?: string) {
  const req = await ctx.db.scheduleChangeRequest.findUnique({ where: { id }, include: { shift: true } });
  if (!req || req.status !== "PENDING") throw new UserError("Request not found or already decided.");
  if ((await recordDecision(ctx, "SCHEDULE", req, approve, note)) === "endorsed") return;
  const tz = ctx.company.timezone;
  const company = { id: ctx.company.id, timezone: tz, settings: ctx.settings };
  if (approve) {
    const day = utcDateToKey(req.date);
    const startAt = req.startMinute != null ? atMinute(day, req.startMinute, tz) : null;
    const endAt =
      startAt && req.durationMinutes ? new Date(startAt.getTime() + req.durationMinutes * 60_000) : null;
    if (req.kind === "REMOVE") {
      if (req.shift) {
        await ctx.db.shift.delete({ where: { id: req.shift.id } });
        await rebuildForSchedule(company, [
          { employeeId: req.employeeId, from: req.shift.startAt, to: req.shift.endAt },
        ]);
      }
    } else if (req.kind === "CHANGE" && req.shift) {
      await ctx.db.shift.update({
        where: { id: req.shift.id },
        data: {
          startAt: startAt!,
          endAt: endAt!,
          locationId: req.locationId ?? req.shift.locationId,
          status: "PUBLISHED",
          publishedAt: new Date(),
          confirmedAt: new Date(),
          recurrenceId: null,
        },
      });
      await rebuildForSchedule(company, [
        { employeeId: req.employeeId, from: req.shift.startAt, to: req.shift.endAt },
        { employeeId: req.employeeId, from: startAt!, to: endAt! },
      ]);
    } else {
      await ctx.db.shift.create({
        data: {
          companyId: ctx.company.id,
          employeeId: req.employeeId,
          locationId: req.locationId!,
          startAt: startAt!,
          endAt: endAt!,
          status: "PUBLISHED",
          publishedAt: new Date(),
          confirmedAt: new Date(),
        },
      });
      await rebuildForSchedule(company, [{ employeeId: req.employeeId, from: startAt!, to: endAt! }]);
    }
  }
  await ctx.db.scheduleChangeRequest.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "DECLINED", decidedById: ctx.employee.id, decidedAt: new Date() },
  });
  await writeAudit(actorFrom(ctx), {
    action: approve ? "schedule.approve" : "schedule.decline",
    entityType: "ScheduleChangeRequest",
    entityId: id,
    before: req.shift ? { startAt: req.shift.startAt, endAt: req.shift.endAt } : undefined,
    after: { kind: req.kind, date: utcDateToKey(req.date), change: describeSchedule(req) },
    reason: note,
  });
  await notify(ctx.company.id, req.employeeId, {
    kind: "schedule.decided",
    title: `Schedule change ${approve ? "approved" : "declined"}`,
    body: `${formatKey(utcDateToKey(req.date))}: ${describeSchedule(req)}${note ? `. ${note}` : ""}`,
    url: "/me/schedule",
    email: true,
  });
}

// ───────────── Attendance corrections ─────────────

const dt = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Enter a date and time")
  .nullish()
  .transform((v) => v || null);

const correctionSchema = z.object({
  kind: z.enum(["MISSING_IN", "MISSING_OUT", "WRONG_TIME", "MISSING_BREAK", "VOID"]),
  timeEntryId: z.string().nullish(),
  clockIn: dt,
  clockOut: dt,
  breakStart: dt,
  breakEnd: dt,
  reason: z.string().trim().min(3, "Explain what happened").max(500),
});

export const CORRECTION_LABELS: Record<CorrectionKind, string> = {
  MISSING_IN: "Missing clock-in",
  MISSING_OUT: "Missing clock-out",
  WRONG_TIME: "Wrong time",
  MISSING_BREAK: "Missing break",
  VOID: "Remove a duty",
};

export async function requestCorrection(ctx: AppContext, raw: unknown, forEmployeeId?: string | null) {
  requireFeature(ctx, "approvals");
  const input = correctionSchema.parse(raw);
  const emp = await subjectOf(ctx, forEmployeeId);
  const tz = ctx.company.timezone;
  const at = (v: string | null) => (v ? parseLocalDateTime(v, tz) : null);
  const clockInAt = at(input.clockIn);
  const clockOutAt = at(input.clockOut);
  const breakStartAt = at(input.breakStart);
  const breakEndAt = at(input.breakEnd);
  const entry = input.timeEntryId
    ? await ctx.db.timeEntry.findFirst({ where: { id: input.timeEntryId, employeeId: emp.id } })
    : null;
  if (input.timeEntryId && !entry) throw new UserError("That time entry isn't yours.");
  const need = (ok: unknown, msg: string) => {
    if (!ok) throw new UserError(msg);
  };
  switch (input.kind) {
    case "MISSING_IN":
      need(clockInAt, "Enter the time you started.");
      break;
    case "MISSING_OUT":
      need(clockOutAt, "Enter the time you finished.");
      if (entry && clockOutAt! <= entry.clockInAt)
        throw new UserError("The clock-out must be after the clock-in.");
      break;
    case "WRONG_TIME":
      need(entry, "Choose the entry to fix.");
      need(clockInAt || clockOutAt, "Enter the correct time.");
      break;
    case "MISSING_BREAK":
      need(breakStartAt && breakEndAt, "Enter when the break started and ended.");
      if (breakEndAt! <= breakStartAt!) throw new UserError("The break must end after it starts.");
      break;
    case "VOID":
      need(entry, "Choose the entry to remove.");
      break;
  }
  const now = Date.now();
  for (const t of [clockInAt, clockOutAt, breakStartAt, breakEndAt])
    if (t && t.getTime() > now + 5 * 60_000) throw new UserError("Corrections can't be in the future.");
  const anchor = clockInAt ?? clockOutAt ?? breakStartAt ?? entry!.clockInAt;
  await assertPeriodOpen(prisma, { companyId: ctx.company.id, timezone: tz }, anchor).catch(() => {
    throw new UserError("Payroll for that date is finalized. Ask HR to record it as an adjustment.");
  });
  const req = await ctx.db.attendanceCorrectionRequest.create({
    data: {
      companyId: ctx.company.id,
      employeeId: emp.id,
      kind: input.kind,
      date: keyToUtcDate(dateKey(anchor, tz)),
      timeEntryId: entry?.id ?? null,
      clockInAt,
      clockOutAt,
      breakStartAt,
      breakEndAt,
      reason: input.reason,
      filedById: ctx.employee.id,
    },
  });
  await writeAudit(actorFrom(ctx), {
    action: "correction.request",
    entityType: "AttendanceCorrectionRequest",
    entityId: req.id,
    after: {
      kind: input.kind,
      clockInAt,
      clockOutAt,
      breakStartAt,
      breakEndAt,
      timeEntryId: entry?.id,
      reason: input.reason,
    },
  });
  await notifyManagers(ctx.company.id, emp.id, {
    kind: "correction.request",
    title: `${fullName(emp)} filed an attendance correction`,
    body: `${CORRECTION_LABELS[input.kind]} on ${formatKey(dateKey(anchor, tz))}: ${input.reason}`,
    url: "/app/approvals",
  });
  return req;
}

export function describeCorrection(
  r: {
    kind: CorrectionKind;
    clockInAt: Date | null;
    clockOutAt: Date | null;
    breakStartAt: Date | null;
    breakEndAt: Date | null;
  },
  tz: string,
) {
  const t = (d: Date | null) => (d ? formatDateTime(d, tz) : null);
  const parts = [
    r.clockInAt && `in ${t(r.clockInAt)}`,
    r.clockOutAt && `out ${t(r.clockOutAt)}`,
    r.breakStartAt && `break ${t(r.breakStartAt)}–${t(r.breakEndAt)}`,
  ].filter(Boolean);
  return `${CORRECTION_LABELS[r.kind]}${parts.length ? `: ${parts.join(", ")}` : ""}`;
}

/**
 * A final approval adds correction punches (or voids punches) and re-pairs the day, so the
 * fix flows into timesheets, reports and payroll. The original punches stay in the log, voided.
 */
export async function decideCorrection(ctx: AppContext, id: string, approve: boolean, note?: string) {
  const req = await ctx.db.attendanceCorrectionRequest.findUnique({
    where: { id },
    include: { employee: true },
  });
  if (!req || req.status !== "PENDING") throw new UserError("Request not found or already decided.");
  if ((await recordDecision(ctx, "CORRECTION", req, approve, note)) === "endorsed") return;
  const tz = ctx.company.timezone;
  if (approve) await applyCorrection(ctx, req);
  await ctx.db.attendanceCorrectionRequest.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "DECLINED", decidedById: ctx.employee.id, decidedAt: new Date() },
  });
  await writeAudit(actorFrom(ctx), {
    action: approve ? "correction.approve" : "correction.decline",
    entityType: "AttendanceCorrectionRequest",
    entityId: id,
    after: { change: describeCorrection(req, tz), timeEntryId: req.timeEntryId },
    reason: note,
  });
  await notify(ctx.company.id, req.employeeId, {
    kind: "correction.decided",
    title: `Attendance correction ${approve ? "approved" : "declined"}`,
    body: `${describeCorrection(req, tz)}${note ? `. ${note}` : ""}`,
    url: "/me/timesheet",
    email: true,
  });
}

type CorrectionRow = NonNullable<
  Awaited<ReturnType<AppContext["db"]["attendanceCorrectionRequest"]["findUnique"]>>
> & {
  employee: { id: string; firstName: string; lastName: string; status: "INVITED" | "ACTIVE" | "ARCHIVED" };
};

async function applyCorrection(ctx: AppContext, req: CorrectionRow) {
  const tz = ctx.company.timezone;
  const anchor = req.clockInAt ?? req.clockOutAt ?? req.breakStartAt ?? req.date;
  await assertPeriodOpen(prisma, { companyId: ctx.company.id, timezone: tz }, anchor).catch(() => {
    throw new UserError("Payroll for that date is finalized. Record it as a payroll adjustment instead.");
  });
  const actor = {
    companyId: ctx.company.id,
    timezone: tz,
    plan: ctx.plan,
    settings: ctx.settings,
    employee: req.employee,
  };
  const add = (action: "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END", at: Date, key: string) =>
    punch(actor, {
      action,
      at,
      source: "CORRECTION",
      offline: true,
      system: true,
      clientId: `corr:${req.id}:${key}`,
    });
  const voidPunches = (where: { id?: { in: string[] }; timeEntryId?: string }) =>
    prisma.punch.updateMany({
      where: { companyId: ctx.company.id, employeeId: req.employeeId, voidedAt: null, ...where },
      data: { voidedAt: new Date(), voidedById: ctx.employee.id, voidReason: `Correction ${req.id}` },
    });
  const entry = req.timeEntryId
    ? await prisma.timeEntry.findUnique({ where: { id: req.timeEntryId } })
    : null;
  if (entry?.status === "LOCKED") throw new UserError("That entry is locked by a finalized payroll run.");

  switch (req.kind) {
    case "MISSING_IN":
      await add("CLOCK_IN", req.clockInAt!, "in");
      break;
    case "MISSING_OUT":
      await add("CLOCK_OUT", req.clockOutAt!, "out");
      break;
    case "MISSING_BREAK":
      await add("BREAK_START", req.breakStartAt!, "bs");
      await add("BREAK_END", req.breakEndAt!, "be");
      break;
    case "WRONG_TIME": {
      if (!entry) throw new UserError("The entry no longer exists.");
      if (entry.manualOverride || !entry.inPunchId) {
        // Hand-edited entries aren't rebuilt from punches; correct the entry itself.
        await prisma.timeEntry.update({
          where: { id: entry.id },
          data: {
            clockInAt: req.clockInAt ?? entry.clockInAt,
            clockOutAt: req.clockOutAt ?? entry.clockOutAt,
            status: (req.clockOutAt ?? entry.clockOutAt) ? "CLOSED" : "OPEN",
            manualOverride: true,
            flags: [],
          },
        });
        break;
      }
      const stale = [req.clockInAt ? entry.inPunchId : null, req.clockOutAt ? entry.outPunchId : null].filter(
        (x): x is string => !!x,
      );
      if (stale.length) await voidPunches({ id: { in: stale } });
      if (req.clockInAt) await add("CLOCK_IN", req.clockInAt, "in");
      if (req.clockOutAt) await add("CLOCK_OUT", req.clockOutAt, "out");
      break;
    }
    case "VOID":
      if (!entry) break;
      await voidPunches({ timeEntryId: entry.id });
      await prisma.timeEntry.delete({ where: { id: entry.id } });
      break;
  }
  // The missing-punch flags this fixed no longer need attention.
  await prisma.timeException.updateMany({
    where: {
      companyId: ctx.company.id,
      employeeId: req.employeeId,
      status: "OPEN",
      // The fixed entry's own flag (it may be dated the day before an overnight clock-out), or that day's.
      OR: [{ date: req.date }, ...(req.timeEntryId ? [{ timeEntryId: req.timeEntryId }] : [])],
      type: { in: ["MISSED_CLOCK_OUT", "MISSING_CLOCK_IN"] },
    },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedById: ctx.employee.id,
      resolutionNote: "Fixed by an approved attendance correction",
    },
  });
}

// ───────────── Cancel ─────────────

export async function cancelRequest(
  ctx: AppContext,
  type: "SCHEDULE" | "CORRECTION" | "OVERTIME",
  id: string,
) {
  const where = { id, employeeId: ctx.employee.id, status: "PENDING" as const };
  const data = { status: "CANCELED" as const };
  const res =
    type === "SCHEDULE"
      ? await ctx.db.scheduleChangeRequest.updateMany({ where, data })
      : type === "CORRECTION"
        ? await ctx.db.attendanceCorrectionRequest.updateMany({ where, data })
        : await ctx.db.overtimeRequest.updateMany({ where, data });
  if (res.count === 0) throw new UserError("Only your own pending requests can be canceled.");
  await writeAudit(actorFrom(ctx), {
    action: `${type.toLowerCase()}.cancel`,
    entityType: type,
    entityId: id,
  });
}

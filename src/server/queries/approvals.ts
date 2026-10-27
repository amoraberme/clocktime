import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { formatDateTime, formatKey, formatMinutes, formatTime, utcDateToKey } from "@/lib/time";
import { fullName } from "@/lib/utils";
import type { AppContext } from "../context";
import { prisma } from "../db";
import { employeeScopeWhere } from "../scope";
import { canDecideAt, REQUEST_LABELS, requiredLevels, type RequestType } from "../services/approvals";
import { describeCorrection, describeSchedule } from "../services/requests";

export type InboxType = RequestType | "SWAP" | "CLAIM";

export const INBOX_LABELS: Record<InboxType, string> = {
  ...REQUEST_LABELS,
  SWAP: "Shift swap",
  CLAIM: "Open shift",
};

export type InboxItem = {
  type: InboxType;
  id: string;
  employeeId: string;
  employee: string;
  branch: string;
  department: string;
  title: string;
  detail: string;
  reason: string | null;
  filedAt: string;
  level: number;
  levels: number;
  canDecide: boolean;
  /** "Endorse" when a supervisor's approval sends it on to HR; otherwise "Approve" */
  approveLabel: "Approve" | "Endorse";
  /** Overtime: minutes requested, which the approver may adjust */
  minutes?: number;
};

export type InboxFilters = { type?: string | null; locationId?: string | null; departmentId?: string | null };

const employeeInclude = {
  department: { select: { name: true } },
  locations: { include: { location: { select: { name: true } } } },
} satisfies Prisma.EmployeeInclude;

type Emp = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

function who(e: Emp) {
  return {
    employeeId: e.id,
    employee: fullName(e),
    branch: e.locations.map((l) => l.location.name).join(", "),
    department: e.department?.name ?? "",
  };
}

/** Everything waiting on a decision from this user's scope, oldest first. */
export async function approvalInbox(ctx: AppContext, f: InboxFilters = {}): Promise<InboxItem[]> {
  const tz = ctx.company.timezone;
  const employee: Prisma.EmployeeWhereInput = {
    ...employeeScopeWhere(ctx),
    ...(f.departmentId ? { departmentId: f.departmentId } : {}),
    ...(f.locationId ? { AND: [{ locations: { some: { locationId: f.locationId } } }] } : {}),
  };
  const want = (t: InboxType) => !f.type || f.type === t;
  const pending = { status: "PENDING" as const, employee };
  const [leave, overtime, schedule, corrections, swaps, claims] = await Promise.all([
    want("LEAVE") && ctx.can("leave")
      ? ctx.db.leaveRequest.findMany({
          where: pending,
          include: { employee: { include: employeeInclude }, leaveType: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
    want("OVERTIME") && ctx.can("overtime")
      ? ctx.db.overtimeRequest.findMany({
          where: pending,
          include: { employee: { include: employeeInclude } },
          orderBy: { createdAt: "asc" },
        })
      : [],
    want("SCHEDULE") && ctx.can("approvals")
      ? ctx.db.scheduleChangeRequest.findMany({
          where: pending,
          include: { employee: { include: employeeInclude }, shift: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
    want("CORRECTION") && ctx.can("approvals")
      ? ctx.db.attendanceCorrectionRequest.findMany({
          where: pending,
          include: { employee: { include: employeeInclude } },
          orderBy: { createdAt: "asc" },
        })
      : [],
    want("SWAP") && ctx.can("shiftSwaps")
      ? ctx.db.shiftSwapRequest.findMany({
          where: { status: "PENDING_MANAGER", requester: employee },
          include: { requester: { include: employeeInclude }, targetEmployee: true, shift: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
    want("CLAIM") && ctx.can("openShifts")
      ? prisma.openShiftClaim.findMany({
          where: { status: "PENDING", shift: { companyId: ctx.company.id, employeeId: null }, employee },
          include: { employee: { include: employeeInclude }, shift: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);
  const item = (type: RequestType, level: number) => {
    const levels = requiredLevels(ctx, type);
    const approveLabel =
      levels === 2 && level === 1 && !ctx.isHr ? ("Endorse" as const) : ("Approve" as const);
    return { level, levels, canDecide: canDecideAt(ctx, type, level), approveLabel };
  };
  const span = (a: Date, b: Date) =>
    `${formatKey(utcDateToKey(a))}${a.getTime() !== b.getTime() ? ` – ${formatKey(utcDateToKey(b))}` : ""}`;
  const items: InboxItem[] = [
    ...leave.map((r) => ({
      type: "LEAVE" as const,
      id: r.id,
      ...who(r.employee),
      title: r.leaveType.name,
      detail: `${span(r.startDate, r.endDate)} · ${r.days} day${r.days === 1 ? "" : "s"}`,
      reason: r.reason,
      filedAt: r.createdAt.toISOString(),
      ...item("LEAVE", r.currentLevel),
    })),
    ...overtime.map((r) => ({
      type: "OVERTIME" as const,
      id: r.id,
      ...who(r.employee),
      title: "Overtime",
      detail: `${formatKey(utcDateToKey(r.date))} · ${formatMinutes(r.minutes)}`,
      reason: r.reason,
      filedAt: r.createdAt.toISOString(),
      minutes: r.minutes,
      ...item("OVERTIME", r.currentLevel),
    })),
    ...schedule.map((r) => ({
      type: "SCHEDULE" as const,
      id: r.id,
      ...who(r.employee),
      title: "Schedule change",
      detail: `${formatKey(utcDateToKey(r.date))}: ${describeSchedule(r)}${
        r.shift ? ` (now ${formatTime(r.shift.startAt, tz)}–${formatTime(r.shift.endAt, tz)})` : ""
      }`,
      reason: r.reason,
      filedAt: r.createdAt.toISOString(),
      ...item("SCHEDULE", r.currentLevel),
    })),
    ...corrections.map((r) => ({
      type: "CORRECTION" as const,
      id: r.id,
      ...who(r.employee),
      title: "Attendance correction",
      detail: `${formatKey(utcDateToKey(r.date))}: ${describeCorrection(r, tz)}`,
      reason: r.reason,
      filedAt: r.createdAt.toISOString(),
      ...item("CORRECTION", r.currentLevel),
    })),
    ...swaps.map((s) => ({
      type: "SWAP" as const,
      id: s.id,
      ...who(s.requester),
      title: s.targetShiftId ? "Shift trade" : "Shift give-away",
      detail: `${formatDateTime(s.shift.startAt, tz)}–${formatTime(s.shift.endAt, tz)}${
        s.targetEmployee ? ` → ${fullName(s.targetEmployee)}` : ""
      }`,
      reason: s.note,
      filedAt: s.createdAt.toISOString(),
      level: 1,
      levels: 1,
      canDecide: ctx.approves("schedule"),
      approveLabel: "Approve" as const,
    })),
    ...claims.map((c) => ({
      type: "CLAIM" as const,
      id: c.id,
      ...who(c.employee),
      title: "Open shift pick-up",
      detail: `${formatDateTime(c.shift.startAt, tz)}–${formatTime(c.shift.endAt, tz)}`,
      reason: null,
      filedAt: c.createdAt.toISOString(),
      level: 1,
      levels: 1,
      canDecide: ctx.approves("schedule"),
      approveLabel: "Approve" as const,
    })),
  ];
  return items.sort((a, b) => a.filedAt.localeCompare(b.filedAt));
}

/** How many requests are waiting on this user, for the dashboard and sidebar badge. */
export async function inboxCount(ctx: AppContext) {
  return (await approvalInbox(ctx)).filter((i) => i.canDecide).length;
}

export type MyRequest = {
  type: RequestType;
  id: string;
  title: string;
  detail: string;
  status: string;
  level: number;
  levels: number;
  filedAt: string;
  cancelable: boolean;
};

/** An employee's own requests from the last 90 days. */
export async function myRequests(ctx: AppContext): Promise<MyRequest[]> {
  const tz = ctx.company.timezone;
  const where = { employeeId: ctx.employee.id, createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) } };
  const [leave, overtime, schedule, corrections] = await Promise.all([
    ctx.db.leaveRequest.findMany({ where, include: { leaveType: true } }),
    ctx.db.overtimeRequest.findMany({ where }),
    ctx.db.scheduleChangeRequest.findMany({ where }),
    ctx.db.attendanceCorrectionRequest.findMany({ where }),
  ]);
  const base = (
    type: RequestType,
    r: { id: string; status: string; currentLevel: number; createdAt: Date },
  ) => ({
    type,
    id: r.id,
    status: r.status,
    level: r.currentLevel,
    levels: requiredLevels(ctx, type),
    filedAt: r.createdAt.toISOString(),
    cancelable: r.status === "PENDING" && type !== "LEAVE",
  });
  return [
    ...leave.map((r) => ({
      ...base("LEAVE", r),
      title: r.leaveType.name,
      detail: `${formatKey(utcDateToKey(r.startDate))} · ${r.days} day${r.days === 1 ? "" : "s"}`,
    })),
    ...overtime.map((r) => ({
      ...base("OVERTIME", r),
      title: "Overtime",
      detail: `${formatKey(utcDateToKey(r.date))} · ${formatMinutes(r.minutes)}`,
    })),
    ...schedule.map((r) => ({
      ...base("SCHEDULE", r),
      title: "Schedule change",
      detail: `${formatKey(utcDateToKey(r.date))}: ${describeSchedule(r)}`,
    })),
    ...corrections.map((r) => ({
      ...base("CORRECTION", r),
      title: "Attendance correction",
      detail: `${formatKey(utcDateToKey(r.date))}: ${describeCorrection(r, tz)}`,
    })),
  ].sort((a, b) => b.filedAt.localeCompare(a.filedAt));
}

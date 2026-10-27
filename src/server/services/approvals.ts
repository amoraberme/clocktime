import "server-only";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import type { AppContext, Approval } from "../context";
import { assertApprover, assertEmployeeInScope, assertNotSelf } from "../scope";
import { notifyManagers } from "./notifications";

export type RequestType = "LEAVE" | "OVERTIME" | "SCHEDULE" | "CORRECTION";

export const REQUEST_LABELS: Record<RequestType, string> = {
  LEAVE: "Leave",
  OVERTIME: "Overtime",
  SCHEDULE: "Schedule change",
  CORRECTION: "Attendance correction",
};

const APPROVAL_KIND: Record<RequestType, Approval> = {
  LEAVE: "leave",
  OVERTIME: "overtime",
  SCHEDULE: "schedule",
  CORRECTION: "attendance",
};

const LEVEL_SETTING = {
  LEAVE: "approvalLevelsLeave",
  OVERTIME: "approvalLevelsOvertime",
  SCHEDULE: "approvalLevelsSchedule",
  CORRECTION: "approvalLevelsCorrection",
} as const;

type Ctx = AppContext;

/** 1 = one approver; 2 = a supervisor endorses, then HR approves. Two levels need Enterprise. */
export function requiredLevels(ctx: Pick<Ctx, "can" | "settings">, type: RequestType) {
  return ctx.can("multiLevelApproval") ? ctx.settings[LEVEL_SETTING[type]] : 1;
}

/** Whether this user can act on a request at its current level (for the inbox's buttons). */
export function canDecideAt(
  ctx: Pick<Ctx, "approves" | "isHr" | "can" | "settings">,
  type: RequestType,
  level: number,
) {
  if (!ctx.approves(APPROVAL_KIND[type])) return false;
  return level < 2 || ctx.isHr;
}

async function bumpLevel(ctx: Ctx, type: RequestType, id: string) {
  const data = { currentLevel: 2 };
  switch (type) {
    case "LEAVE":
      return ctx.db.leaveRequest.update({ where: { id }, data });
    case "OVERTIME":
      return ctx.db.overtimeRequest.update({ where: { id }, data });
    case "SCHEDULE":
      return ctx.db.scheduleChangeRequest.update({ where: { id }, data });
    case "CORRECTION":
      return ctx.db.attendanceCorrectionRequest.update({ where: { id }, data });
  }
}

/**
 * Check that this user may decide the request, record the decision in the approval trail, and say
 * whether it is final. With two levels, a supervisor's approval endorses the request to HR; HR's
 * approval (at either level) and any decline are final. The caller applies final decisions.
 */
export async function recordDecision(
  ctx: Ctx,
  type: RequestType,
  req: { id: string; employeeId: string; currentLevel: number },
  approve: boolean,
  note?: string,
): Promise<"final" | "endorsed"> {
  assertApprover(ctx, APPROVAL_KIND[type]);
  assertNotSelf(ctx, req.employeeId, REQUEST_LABELS[type].toLowerCase());
  await assertEmployeeInScope(ctx, req.employeeId);
  const levels = requiredLevels(ctx, type);
  const final = !approve || levels === 1 || ctx.isHr;
  if (!final && req.currentLevel >= 2)
    throw new UserError("This request was endorsed and is waiting for HR's final approval.");
  await ctx.db.approvalStep.create({
    data: {
      companyId: ctx.company.id,
      requestType: type,
      requestId: req.id,
      level: req.currentLevel,
      approved: approve,
      decidedById: ctx.employee.id,
      note: note || null,
    },
  });
  if (final) return "final";
  await bumpLevel(ctx, type, req.id);
  await writeAudit(actorFrom(ctx), {
    action: `${type.toLowerCase()}.endorse`,
    entityType: type,
    entityId: req.id,
    reason: note,
  });
  await notifyManagers(
    ctx.company.id,
    req.employeeId,
    {
      kind: "approval.endorsed",
      title: `${REQUEST_LABELS[type]} endorsed for HR approval`,
      body: `${ctx.user.name || ctx.user.email} endorsed it.${note ? ` ${note}` : ""}`,
      url: "/app/approvals",
    },
    ["HR", "ADMIN", "OWNER"],
  );
  return "endorsed";
}

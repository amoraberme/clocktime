import "server-only";
import { formatDateTime } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import { requireFeature, type AppContext } from "../context";
import { prisma } from "../db";
import { assertApprover, assertEmployeeInScope, assertNotSelf } from "../scope";
import { notify, notifyManagers } from "./notifications";

export async function requestSwap(
  ctx: AppContext,
  shiftId: string,
  input: { targetEmployeeId?: string | null; targetShiftId?: string | null; note?: string },
) {
  requireFeature(ctx, "shiftSwaps");
  const shift = await ctx.db.shift.findUnique({ where: { id: shiftId } });
  if (!shift || shift.employeeId !== ctx.employee.id || shift.status !== "PUBLISHED")
    throw new UserError("You can only swap your own published shifts.");
  if (shift.startAt < new Date()) throw new UserError("This shift has already started.");
  const open = await ctx.db.shiftSwapRequest.findFirst({
    where: { shiftId, status: { in: ["PENDING_PEER", "PENDING_MANAGER"] } },
  });
  if (open) throw new UserError("There's already a pending request for this shift.");
  let targetShiftId: string | null = null;
  if (input.targetShiftId) {
    const t = await ctx.db.shift.findUnique({ where: { id: input.targetShiftId } });
    if (!t || t.employeeId !== input.targetEmployeeId || t.status !== "PUBLISHED")
      throw new UserError("Pick one of your colleague's published shifts.");
    targetShiftId = t.id;
  }
  if (input.targetEmployeeId) {
    const target = await ctx.db.employee.findUnique({ where: { id: input.targetEmployeeId } });
    if (!target || target.status !== "ACTIVE" || target.id === ctx.employee.id)
      throw new UserError("Pick an active colleague.");
  }
  const req = await ctx.db.shiftSwapRequest.create({
    data: {
      companyId: ctx.company.id,
      shiftId,
      requesterId: ctx.employee.id,
      targetEmployeeId: input.targetEmployeeId || null,
      targetShiftId,
      note: input.note,
      status: input.targetEmployeeId ? "PENDING_PEER" : "PENDING_MANAGER",
    },
  });
  const when = formatDateTime(shift.startAt, ctx.company.timezone);
  if (input.targetEmployeeId) {
    await notify(ctx.company.id, input.targetEmployeeId, {
      kind: "swap.request",
      title: `${ctx.employee.firstName} wants to ${targetShiftId ? "trade shifts" : "give you a shift"}`,
      body: `Shift on ${when}. Tap to accept or decline.`,
      url: "/me/schedule",
      email: true,
    });
  } else {
    await notifyManagers(ctx.company.id, ctx.employee.id, {
      kind: "swap.release",
      title: `${fullName(ctx.employee)} wants to drop a shift`,
      body: `Shift on ${when}.`,
      url: "/app/schedule",
    });
  }
  return req;
}

export async function respondToSwap(ctx: AppContext, requestId: string, accept: boolean) {
  const req = await ctx.db.shiftSwapRequest.findUnique({
    where: { id: requestId },
    include: { shift: true },
  });
  if (!req || req.targetEmployeeId !== ctx.employee.id || req.status !== "PENDING_PEER")
    throw new UserError("Request not found.");
  await ctx.db.shiftSwapRequest.update({
    where: { id: requestId },
    data: { status: accept ? "PENDING_MANAGER" : "DECLINED", decidedAt: accept ? null : new Date() },
  });
  if (accept) {
    await notifyManagers(ctx.company.id, req.requesterId, {
      kind: "swap.approval",
      title: "Shift swap needs your approval",
      body: `${fullName(ctx.employee)} agreed to take a shift on ${formatDateTime(req.shift.startAt, ctx.company.timezone)}.`,
      url: "/app/schedule",
    });
  } else {
    await notify(ctx.company.id, req.requesterId, {
      kind: "swap.declined",
      title: "Swap declined",
      body: `${ctx.employee.firstName} can't take your shift.`,
      url: "/me/schedule",
    });
  }
}

export async function decideSwap(ctx: AppContext, requestId: string, approve: boolean) {
  const req = await ctx.db.shiftSwapRequest.findUnique({
    where: { id: requestId },
    include: { shift: true, targetShift: true },
  });
  if (!req || req.status !== "PENDING_MANAGER") throw new UserError("Request not found or already decided.");
  assertApprover(ctx, "schedule");
  assertNotSelf(ctx, req.requesterId, "shift swap");
  await assertEmployeeInScope(ctx, req.requesterId);
  if (approve) {
    await prisma.$transaction(async (tx) => {
      if (req.targetShiftId && req.targetShift) {
        await tx.shift.update({
          where: { id: req.shiftId },
          data: { employeeId: req.targetEmployeeId, confirmedAt: new Date() },
        });
        await tx.shift.update({
          where: { id: req.targetShiftId },
          data: { employeeId: req.requesterId, confirmedAt: new Date() },
        });
      } else {
        await tx.shift.update({
          where: { id: req.shiftId },
          data: {
            employeeId: req.targetEmployeeId ?? null,
            confirmedAt: req.targetEmployeeId ? new Date() : null,
          },
        });
      }
      await tx.shiftSwapRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED", decidedById: ctx.employee.id, decidedAt: new Date() },
      });
    });
  } else {
    await ctx.db.shiftSwapRequest.update({
      where: { id: requestId },
      data: { status: "DECLINED", decidedById: ctx.employee.id, decidedAt: new Date() },
    });
  }
  await writeAudit(actorFrom(ctx), {
    action: approve ? "swap.approve" : "swap.decline",
    entityType: "ShiftSwapRequest",
    entityId: requestId,
  });
  const msg = {
    kind: "swap.decided",
    title: approve ? "Shift swap approved" : "Shift swap declined",
    body: "Check your updated schedule.",
    url: "/me/schedule",
  };
  await notify(ctx.company.id, req.requesterId, msg);
  if (req.targetEmployeeId) await notify(ctx.company.id, req.targetEmployeeId, msg);
}

export async function cancelSwap(ctx: AppContext, requestId: string) {
  const req = await ctx.db.shiftSwapRequest.findUnique({ where: { id: requestId } });
  if (
    !req ||
    req.requesterId !== ctx.employee.id ||
    !["PENDING_PEER", "PENDING_MANAGER"].includes(req.status)
  )
    throw new UserError("Request not found.");
  await ctx.db.shiftSwapRequest.update({ where: { id: requestId }, data: { status: "CANCELED" } });
}

export async function claimOpenShift(ctx: AppContext, shiftId: string) {
  requireFeature(ctx, "openShifts");
  const shift = await ctx.db.shift.findUnique({ where: { id: shiftId } });
  if (!shift || shift.employeeId || shift.status !== "PUBLISHED")
    throw new UserError("This shift is no longer open.");
  if (shift.startAt < new Date()) throw new UserError("This shift has already started.");
  const overlap = await ctx.db.shift.findFirst({
    where: { employeeId: ctx.employee.id, startAt: { lt: shift.endAt }, endAt: { gt: shift.startAt } },
  });
  if (overlap) throw new UserError("You already have a shift at that time.");
  await prisma.openShiftClaim.upsert({
    where: { shiftId_employeeId: { shiftId, employeeId: ctx.employee.id } },
    create: { shiftId, employeeId: ctx.employee.id },
    update: { status: "PENDING" },
  });
  await notifyManagers(ctx.company.id, ctx.employee.id, {
    kind: "openshift.claim",
    title: `${fullName(ctx.employee)} wants an open shift`,
    body: formatDateTime(shift.startAt, ctx.company.timezone),
    url: "/app/schedule",
  });
}

export async function decideClaim(ctx: AppContext, claimId: string, approve: boolean) {
  const claim = await prisma.openShiftClaim.findUnique({ where: { id: claimId }, include: { shift: true } });
  if (!claim || claim.shift.companyId !== ctx.company.id || claim.status !== "PENDING")
    throw new UserError("Claim not found.");
  assertApprover(ctx, "schedule");
  assertNotSelf(ctx, claim.employeeId, "shift claim");
  await assertEmployeeInScope(ctx, claim.employeeId);
  if (approve) {
    if (claim.shift.employeeId) throw new UserError("This shift was already given to someone else.");
    await prisma.$transaction([
      prisma.shift.update({
        where: { id: claim.shiftId },
        data: { employeeId: claim.employeeId, confirmedAt: new Date() },
      }),
      prisma.openShiftClaim.update({ where: { id: claimId }, data: { status: "APPROVED" } }),
      prisma.openShiftClaim.updateMany({
        where: { shiftId: claim.shiftId, id: { not: claimId }, status: "PENDING" },
        data: { status: "DECLINED" },
      }),
    ]);
  } else {
    await prisma.openShiftClaim.update({ where: { id: claimId }, data: { status: "DECLINED" } });
  }
  await writeAudit(actorFrom(ctx), {
    action: approve ? "claim.approve" : "claim.decline",
    entityType: "OpenShiftClaim",
    entityId: claimId,
  });
  await notify(ctx.company.id, claim.employeeId, {
    kind: "openshift.decided",
    title: approve ? "You got the shift!" : "Open shift went to someone else",
    body: formatDateTime(claim.shift.startAt, ctx.company.timezone),
    url: "/me/schedule",
  });
}

export type PendingRequest =
  | {
      kind: "swap";
      id: string;
      requester: string;
      target: string | null;
      trade: boolean;
      shiftStart: Date;
      shiftEnd: Date;
      note: string | null;
    }
  | { kind: "claim"; id: string; requester: string; shiftStart: Date; shiftEnd: Date };

export async function pendingRequests(ctx: AppContext): Promise<PendingRequest[]> {
  if (!ctx.isManager) return [];
  const [swaps, claims] = await Promise.all([
    ctx.can("shiftSwaps")
      ? ctx.db.shiftSwapRequest.findMany({
          where: { status: "PENDING_MANAGER" },
          include: { requester: true, targetEmployee: true, shift: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
    ctx.can("openShifts")
      ? prisma.openShiftClaim.findMany({
          where: { status: "PENDING", shift: { companyId: ctx.company.id, employeeId: null } },
          include: { employee: true, shift: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);
  return [
    ...swaps.map((s) => ({
      kind: "swap" as const,
      id: s.id,
      requester: fullName(s.requester),
      target: s.targetEmployee ? fullName(s.targetEmployee) : null,
      trade: !!s.targetShiftId,
      shiftStart: s.shift.startAt,
      shiftEnd: s.shift.endAt,
      note: s.note,
    })),
    ...claims.map((c) => ({
      kind: "claim" as const,
      id: c.id,
      requester: fullName(c.employee),
      shiftStart: c.shift.startAt,
      shiftEnd: c.shift.endAt,
    })),
  ];
}

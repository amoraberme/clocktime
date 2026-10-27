"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, UserError } from "@/server/action";
import { actorFrom, writeAudit } from "@/server/audit";
import { getContextOrThrow } from "@/server/context";
import { prisma } from "@/server/db";
import {
  addUnavailableDate,
  removeAvailability,
  saveWeeklyAvailability,
} from "@/server/services/availability";
import { requestOvertime } from "@/server/services/overtime";
import { confirmShift } from "@/server/services/schedule";
import { cancelSwap, claimOpenShift, requestSwap, respondToSwap } from "@/server/services/swaps";
import { setEmployeePin } from "@/server/services/team";
import { pinSchema } from "@/lib/validation/employee";

const refresh = () => revalidatePath("/me", "layout");

export async function confirmShiftAction(id: string) {
  return run(async () => {
    await confirmShift(await getContextOrThrow(), id);
    refresh();
  }, "Shift confirmed. See you there!");
}

export async function requestSwapAction(
  shiftId: string,
  input: { targetEmployeeId?: string | null; targetShiftId?: string | null; note?: string },
) {
  return run(async () => {
    await requestSwap(await getContextOrThrow(), shiftId, input);
    refresh();
  }, "Request sent.");
}

export async function respondSwapAction(id: string, accept: boolean) {
  return run(
    async () => {
      await respondToSwap(await getContextOrThrow(), id, accept);
      refresh();
    },
    accept ? "Accepted. Your manager will confirm." : "Declined.",
  );
}

export async function cancelSwapAction(id: string) {
  return run(async () => {
    await cancelSwap(await getContextOrThrow(), id);
    refresh();
  }, "Request canceled.");
}

export async function claimShiftAction(id: string) {
  return run(async () => {
    await claimOpenShift(await getContextOrThrow(), id);
    refresh();
  }, "Requested. Your manager will confirm.");
}

export async function saveAvailabilityAction(rows: unknown) {
  return run(async () => {
    const ctx = await getContextOrThrow();
    await saveWeeklyAvailability(ctx, ctx.employee.id, rows);
    refresh();
  }, "Availability saved.");
}

export async function addUnavailableDateAction(date: string, note: string) {
  return run(async () => {
    await addUnavailableDate(await getContextOrThrow(), z.iso.date().parse(date), note);
    refresh();
  }, "Saved.");
}

export async function removeAvailabilityAction(id: string) {
  return run(async () => {
    await removeAvailability(await getContextOrThrow(), id);
    refresh();
  });
}

export async function setOwnPinAction(pin: string) {
  return run(async () => {
    const ctx = await getContextOrThrow();
    await setEmployeePin(ctx, ctx.employee.id, pinSchema.parse(pin));
  }, "Kiosk PIN saved.");
}

export async function updateProfileAction(input: { phone: string }) {
  return run(async () => {
    const ctx = await getContextOrThrow();
    const phone = z.string().trim().max(30).parse(input.phone);
    await ctx.db.employee.update({ where: { id: ctx.employee.id }, data: { phone: phone || null } });
    refresh();
  }, "Profile saved.");
}

const pushSchema = z.object({ endpoint: z.url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

export async function savePushSubscriptionAction(sub: unknown) {
  return run(async () => {
    const ctx = await getContextOrThrow();
    const s = pushSchema.parse(sub);
    await prisma.pushSubscription.upsert({
      where: { endpoint: s.endpoint },
      create: { userId: ctx.user.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth },
      update: { userId: ctx.user.id, p256dh: s.keys.p256dh, auth: s.keys.auth },
    });
  }, "Notifications are on for this device.");
}

export async function markNotificationsReadAction() {
  return run(async () => {
    const ctx = await getContextOrThrow();
    await ctx.db.notification.updateMany({
      where: { employeeId: ctx.employee.id, readAt: null },
      data: { readAt: new Date() },
    });
    refresh();
  });
}

export async function requestOvertimeAction(input: { date: string; minutes: number; reason: string }) {
  return run(async () => {
    const ctx = await getContextOrThrow();
    if (!ctx.can("overtime")) throw new UserError("Overtime requests need the Starter plan.");
    await requestOvertime(ctx, input);
    refresh();
  }, "Overtime request sent.");
}

/** Record the employee's informed consent to biometric and/or location processing. */
export async function giveConsentAction(input: { biometric: boolean; location: boolean }) {
  return run(async () => {
    const ctx = await getContextOrThrow();
    const now = new Date();
    const data = {
      ...(input.biometric && !ctx.employee.biometricConsentAt ? { biometricConsentAt: now } : {}),
      ...(input.location && !ctx.employee.locationConsentAt ? { locationConsentAt: now } : {}),
    };
    if (!Object.keys(data).length) return;
    await ctx.db.employee.update({ where: { id: ctx.employee.id }, data });
    await writeAudit(actorFrom(ctx), {
      action: "employee.consent",
      entityType: "Employee",
      entityId: ctx.employee.id,
      after: Object.keys(data),
    });
    revalidatePath("/me");
  }, "Thanks. Your consent is recorded.");
}

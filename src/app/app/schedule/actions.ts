"use server";

import { revalidatePath } from "next/cache";
import { run } from "@/server/action";
import { getContextOrThrow } from "@/server/context";
import {
  copyWeek,
  createShift,
  deleteShift,
  moveShift,
  publishWeek,
  updateShift,
} from "@/server/services/schedule";
import { autoFillOpenShifts, buildFromAvailability } from "@/server/services/auto-schedule";
import { decideClaim, decideSwap } from "@/server/services/swaps";

const done = () => revalidatePath("/app/schedule");

export async function createShiftAction(data: unknown) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    const shifts = await createShift(ctx, data);
    done();
    return shifts.length;
  });
}

export async function updateShiftAction(id: string, data: unknown, scope: "one" | "future") {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    await updateShift(ctx, id, data, scope);
    done();
  }, "Shift updated.");
}

export async function deleteShiftAction(id: string, scope: "one" | "future") {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    await deleteShift(ctx, id, scope);
    done();
  }, "Shift deleted.");
}

export async function moveShiftAction(id: string, employeeId: string | null, date: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    await moveShift(ctx, id, { employeeId, date });
    done();
  });
}

export async function publishWeekAction(weekStart: string, locationId: string | null) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    const r = await publishWeek(ctx, weekStart, locationId);
    done();
    return r;
  });
}

export async function copyWeekAction(fromWeek: string, toWeek: string, locationId: string | null) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    const n = await copyWeek(ctx, fromWeek, toWeek, locationId);
    done();
    return n;
  });
}

export async function autoFillAction(weekStart: string, locationId: string | null) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    const n = await autoFillOpenShifts(ctx, weekStart, locationId);
    done();
    return n;
  });
}

export async function buildFromAvailabilityAction(weekStart: string, locationId: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    const n = await buildFromAvailability(ctx, weekStart, locationId);
    done();
    return n;
  });
}

export async function decideSwapAction(id: string, approve: boolean) {
  return run(
    async () => {
      const ctx = await getContextOrThrow("MANAGER");
      await decideSwap(ctx, id, approve);
      done();
    },
    approve ? "Swap approved." : "Swap declined.",
  );
}

export async function decideClaimAction(id: string, approve: boolean) {
  return run(
    async () => {
      const ctx = await getContextOrThrow("MANAGER");
      await decideClaim(ctx, id, approve);
      done();
    },
    approve ? "Shift assigned." : "Claim declined.",
  );
}

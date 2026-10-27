"use server";

import { revalidatePath } from "next/cache";
import { run } from "@/server/action";
import { getContextOrThrow } from "@/server/context";
import {
  cancelLeave,
  createLeaveType,
  decideLeave,
  requestLeave,
  setEntitlement,
} from "@/server/services/leave";

const refresh = () => {
  revalidatePath("/app/leave");
  revalidatePath("/me/leave");
};

export async function requestLeaveAction(data: unknown, forEmployeeId?: string) {
  return run(
    async () => {
      const ctx = await getContextOrThrow(forEmployeeId ? "MANAGER" : "EMPLOYEE");
      await requestLeave(ctx, data, forEmployeeId);
      refresh();
    },
    forEmployeeId ? "Leave recorded." : "Request sent to your manager.",
  );
}

export async function decideLeaveAction(id: string, approve: boolean) {
  return run(
    async () => {
      await decideLeave(await getContextOrThrow("MANAGER"), id, approve);
      refresh();
    },
    approve ? "Leave approved." : "Leave declined.",
  );
}

export async function cancelLeaveAction(id: string) {
  return run(async () => {
    await cancelLeave(await getContextOrThrow(), id);
    refresh();
  }, "Leave canceled.");
}

export async function createLeaveTypeAction(data: unknown) {
  return run(async () => {
    await createLeaveType(await getContextOrThrow("ADMIN"), data);
    refresh();
  }, "Leave type added.");
}

export async function setEntitlementAction(
  employeeId: string,
  leaveTypeId: string,
  year: number,
  entitled: number,
) {
  return run(async () => {
    await setEntitlement(await getContextOrThrow("ADMIN"), employeeId, leaveTypeId, year, entitled);
    refresh();
  }, "Entitlement updated.");
}

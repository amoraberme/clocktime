"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/server/action";
import { getContextOrThrow } from "@/server/context";
import { cancelRequest, requestCorrection, requestScheduleChange } from "@/server/services/requests";

/** File a correction for yourself, or (supervisors and timekeepers) for someone you manage. */
export async function fileCorrectionAction(input: unknown, forEmployeeId?: string | null) {
  return run(async () => {
    const ctx = await getContextOrThrow();
    await requestCorrection(ctx, input, forEmployeeId);
    revalidatePath("/me/requests");
    revalidatePath("/app/approvals");
  }, "Correction sent for approval.");
}

export async function fileScheduleChangeAction(input: unknown, forEmployeeId?: string | null) {
  return run(async () => {
    const ctx = await getContextOrThrow();
    await requestScheduleChange(ctx, input, forEmployeeId);
    revalidatePath("/me/requests");
    revalidatePath("/app/approvals");
  }, "Schedule change sent for approval.");
}

export async function cancelRequestAction(type: unknown, id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow();
    await cancelRequest(ctx, z.enum(["SCHEDULE", "CORRECTION", "OVERTIME"]).parse(type), id);
    revalidatePath("/me/requests");
  }, "Request canceled.");
}

"use server";

import { revalidatePath } from "next/cache";
import { run } from "@/server/action";
import { getContextOrThrow, requireFeature } from "@/server/context";
import { resolveException } from "@/server/services/exceptions";
import { decideOvertime } from "@/server/services/overtime";

export async function resolveExceptionAction(
  id: string,
  action: "resolve" | "dismiss" | "approve_overtime",
  note?: string,
) {
  return run(
    async () => {
      const ctx = await getContextOrThrow("MANAGER");
      requireFeature(ctx, "exceptions");
      await resolveException(ctx, id, action, note);
      revalidatePath("/app", "layout");
    },
    action === "approve_overtime"
      ? "Overtime approved."
      : action === "dismiss"
        ? "Dismissed."
        : "Marked resolved.",
  );
}

export async function resolveManyAction(ids: string[]) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    requireFeature(ctx, "exceptions");
    for (const id of ids) await resolveException(ctx, id, "resolve", "Bulk resolved");
    revalidatePath("/app", "layout");
    return ids.length;
  });
}

export async function decideOvertimeAction(id: string, approve: boolean, minutes?: number) {
  return run(
    async () => {
      const ctx = await getContextOrThrow("MANAGER");
      await decideOvertime(ctx, id, approve, minutes);
      revalidatePath("/app", "layout");
    },
    approve ? "Overtime approved." : "Overtime declined.",
  );
}

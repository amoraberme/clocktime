"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/server/action";
import { getContextOrThrow, type AppContext } from "@/server/context";
import { decideLeave } from "@/server/services/leave";
import { decideOvertime } from "@/server/services/overtime";
import { decideCorrection, decideScheduleChange } from "@/server/services/requests";
import { decideClaim, decideSwap } from "@/server/services/swaps";

const decisionSchema = z.object({
  type: z.enum(["LEAVE", "OVERTIME", "SCHEDULE", "CORRECTION", "SWAP", "CLAIM"]),
  id: z.string().min(1),
  approve: z.boolean(),
  note: z.string().trim().max(300).optional(),
  minutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional(),
});

type Decision = z.infer<typeof decisionSchema>;

async function decide(ctx: AppContext, d: Decision) {
  switch (d.type) {
    case "LEAVE":
      return decideLeave(ctx, d.id, d.approve, d.note);
    case "OVERTIME":
      return decideOvertime(ctx, d.id, d.approve, d.minutes);
    case "SCHEDULE":
      return decideScheduleChange(ctx, d.id, d.approve, d.note);
    case "CORRECTION":
      return decideCorrection(ctx, d.id, d.approve, d.note);
    case "SWAP":
      return decideSwap(ctx, d.id, d.approve);
    case "CLAIM":
      return decideClaim(ctx, d.id, d.approve);
  }
}

export async function decideRequestAction(input: unknown) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    const d = decisionSchema.parse(input);
    await decide(ctx, d);
    revalidatePath("/app/approvals");
  }, "Done.");
}

/** Approve or decline several at once; reports how many went through and the first problem. */
export async function bulkDecideAction(items: unknown, approve: boolean) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    const list = z
      .array(z.object({ type: decisionSchema.shape.type, id: z.string() }))
      .max(200)
      .parse(items);
    let done = 0;
    const errors: string[] = [];
    for (const it of list) {
      try {
        await decide(ctx, { ...it, approve });
        done++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Failed");
      }
    }
    revalidatePath("/app/approvals");
    return { done, failed: errors.length, firstError: errors[0] ?? null };
  });
}

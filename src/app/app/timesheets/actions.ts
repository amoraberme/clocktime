"use server";

import { revalidatePath } from "next/cache";
import { run } from "@/server/action";
import { getContextOrThrow } from "@/server/context";
import {
  addManualEntry,
  deleteTimeEntry,
  editTimeEntry,
  setTimesheetApproval,
} from "@/server/services/timesheet-edits";

export async function saveEntryAction(input: { entryId?: string; employeeId: string; data: unknown }) {
  return run(
    async () => {
      const ctx = await getContextOrThrow("MANAGER");
      if (input.entryId) await editTimeEntry(ctx, input.entryId, input.data);
      else await addManualEntry(ctx, input.employeeId, input.data);
      revalidatePath("/app/timesheets", "layout");
    },
    input.entryId ? "Entry updated. The change is in the audit trail." : "Entry added.",
  );
}

export async function deleteEntryAction(entryId: string, reason: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    await deleteTimeEntry(ctx, entryId, reason);
    revalidatePath("/app/timesheets", "layout");
  }, "Entry deleted.");
}

export async function approvalAction(
  employeeIds: string[],
  period: { start: string; end: string },
  approve: boolean,
) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    const r = await setTimesheetApproval(ctx, employeeIds, period, approve);
    revalidatePath("/app/timesheets", "layout");
    return r;
  });
}

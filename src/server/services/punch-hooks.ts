import "server-only";
import { detectOnPunch } from "./exceptions";

/** Runs after every accepted punch. Never fails the punch itself. */
export async function afterPunch(companyId: string, employeeId: string, entryId: string) {
  try {
    await detectOnPunch(companyId, employeeId, entryId);
  } catch (err) {
    console.error("afterPunch failed", err);
  }
}

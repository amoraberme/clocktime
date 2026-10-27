"use server";

import { run } from "@/server/action";
import { verifyAuditChain } from "@/server/audit";
import { getContextOrThrow } from "@/server/context";

export async function verifyAuditAction() {
  return run(async () => {
    const ctx = await getContextOrThrow("HR");
    return verifyAuditChain(ctx.company.id);
  });
}

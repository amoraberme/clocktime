"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, UserError } from "@/server/action";
import { API_SCOPES, createApiKey } from "@/server/api-auth";
import { actorFrom, writeAudit } from "@/server/audit";
import { getContextOrThrow, requireFeature } from "@/server/context";

export async function createKeyAction(input: { name: string; scopes: string[] }) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    requireFeature(ctx, "api");
    const { name, scopes } = z
      .object({
        name: z.string().trim().min(2).max(60),
        scopes: z.array(z.enum(API_SCOPES)).min(1, "Pick at least one scope"),
      })
      .parse(input);
    const { key, row } = await createApiKey(ctx.company.id, name, scopes, ctx.employee.id);
    await writeAudit(actorFrom(ctx), {
      action: "apikey.create",
      entityType: "ApiKey",
      entityId: row.id,
      after: { name, scopes },
    });
    revalidatePath("/app/settings/api");
    return key;
  });
}

export async function revokeKeyAction(id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    const k = await ctx.db.apiKey.findUnique({ where: { id } });
    if (!k) throw new UserError("Key not found.");
    await ctx.db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await writeAudit(actorFrom(ctx), { action: "apikey.revoke", entityType: "ApiKey", entityId: id });
    revalidatePath("/app/settings/api");
  }, "Key revoked.");
}

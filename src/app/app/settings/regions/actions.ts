"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, UserError } from "@/server/action";
import { actorFrom, writeAudit } from "@/server/audit";
import { getContextOrThrow, requireFeature } from "@/server/context";

const regionSchema = z.object({
  name: z.string().trim().min(2, "Enter a region name").max(60),
  code: z
    .string()
    .trim()
    .max(12)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null)),
});

export async function saveRegionAction(id: string | null, input: unknown) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    requireFeature(ctx, "regions");
    const r = regionSchema.parse(input);
    const dupe = await ctx.db.region.findFirst({
      where: { name: r.name, ...(id ? { id: { not: id } } : {}) },
    });
    if (dupe) throw new UserError(`There's already a region called ${r.name}.`);
    const saved = id
      ? await ctx.db.region.update({ where: { id }, data: r })
      : await ctx.db.region.create({ data: { ...r, companyId: ctx.company.id } });
    await writeAudit(actorFrom(ctx), {
      action: id ? "region.update" : "region.create",
      entityType: "Region",
      entityId: saved.id,
      after: r,
    });
    revalidatePath("/app/settings/regions");
  }, "Region saved.");
}

export async function deleteRegionAction(id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    const region = await ctx.db.region.findUnique({ where: { id } });
    if (!region) throw new UserError("Region not found.");
    await ctx.db.region.delete({ where: { id } });
    await writeAudit(actorFrom(ctx), {
      action: "region.delete",
      entityType: "Region",
      entityId: id,
      before: region,
    });
    revalidatePath("/app/settings/regions");
  }, "Region removed. Its branches are now unassigned.");
}

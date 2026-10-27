"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, UserError } from "@/server/action";
import { actorFrom, writeAudit } from "@/server/audit";
import { getContextOrThrow, requireFeature } from "@/server/context";
import { createKioskPairing } from "@/server/kiosk";

export async function createKioskAction(input: { name: string; locationId: string }) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    requireFeature(ctx, "kiosk");
    const { name, locationId } = z
      .object({ name: z.string().trim().max(60), locationId: z.string().min(1) })
      .parse(input);
    const d = await createKioskPairing(ctx.company.id, name, locationId);
    await writeAudit(actorFrom(ctx), { action: "kiosk.create", entityType: "Device", entityId: d.id });
    revalidatePath("/app/settings/kiosks");
    return d.pairingCode!;
  });
}

export async function revokeDeviceAction(id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    const d = await ctx.db.device.findUnique({ where: { id } });
    if (!d) throw new UserError("Device not found.");
    await ctx.db.device.update({
      where: { id },
      data: { revokedAt: new Date(), tokenHash: null, pairingCode: null },
    });
    await writeAudit(actorFrom(ctx), { action: "device.revoke", entityType: "Device", entityId: id });
    revalidatePath("/app/settings/kiosks");
  }, "Device removed. It can no longer record punches.");
}

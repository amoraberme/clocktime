import "server-only";
import { z } from "zod";
import { PLANS } from "@/config/plans";
import { canAddLocation, hasFeature } from "@/lib/entitlements";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import type { AppContext } from "../context";

const ipRule = z
  .string()
  .trim()
  .regex(
    /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[0-9a-f:]+$/i,
    "Use an IP like 203.0.113.7 or a range like 203.0.113.0/24",
  );

export const locationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  address: z.string().trim().max(200).optional(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  radiusMeters: z.number().int().min(25).max(5000),
  geofenceMode: z.enum(["OFF", "WARN", "BLOCK"]),
  autoClockOut: z.boolean(),
  allowedIps: z.array(ipRule).max(20),
  requirePhoto: z.boolean(),
});

function gate(ctx: AppContext, input: z.infer<typeof locationSchema>) {
  const plan = ctx.plan;
  return {
    ...input,
    geofenceMode: hasFeature(plan, "geofence") ? input.geofenceMode : "OFF",
    autoClockOut: hasFeature(plan, "geofence") ? input.autoClockOut : false,
    allowedIps: hasFeature(plan, "ipLock") ? input.allowedIps : [],
    requirePhoto: hasFeature(plan, "photoProof") ? input.requirePhoto : false,
  } as const;
}

export async function createLocation(ctx: AppContext, raw: unknown) {
  const input = gate(ctx, locationSchema.parse(raw));
  const count = await ctx.db.location.count({ where: { archivedAt: null } });
  if (!canAddLocation(ctx.plan, count))
    throw new UserError(
      `The ${PLANS[ctx.plan].name} plan includes ${PLANS[ctx.plan].maxLocations} location. Upgrade to Pro for more.`,
    );
  if (input.geofenceMode !== "OFF" && (input.latitude == null || input.longitude == null))
    throw new UserError("Set the location on the map before turning on the geofence.");
  const loc = await ctx.db.location.create({ data: { ...input, companyId: ctx.company.id } });
  await writeAudit(actorFrom(ctx), {
    action: "location.create",
    entityType: "Location",
    entityId: loc.id,
    after: input,
  });
  return loc;
}

export async function updateLocation(ctx: AppContext, id: string, raw: unknown) {
  const input = gate(ctx, locationSchema.parse(raw));
  const before = await ctx.db.location.findUnique({ where: { id } });
  if (!before) throw new UserError("Location not found.");
  if (input.geofenceMode !== "OFF" && (input.latitude == null || input.longitude == null))
    throw new UserError("Set the location on the map before turning on the geofence.");
  const loc = await ctx.db.location.update({ where: { id }, data: input });
  await writeAudit(actorFrom(ctx), {
    action: "location.update",
    entityType: "Location",
    entityId: id,
    before,
    after: input,
  });
  return loc;
}

export async function archiveLocation(ctx: AppContext, id: string) {
  const active = await ctx.db.location.count({ where: { archivedAt: null } });
  if (active <= 1) throw new UserError("You need at least one location.");
  await ctx.db.location.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(actorFrom(ctx), { action: "location.archive", entityType: "Location", entityId: id });
}

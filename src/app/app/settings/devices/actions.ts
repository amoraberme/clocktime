"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, UserError } from "@/server/action";
import { actorFrom, writeAudit } from "@/server/audit";
import { getContextOrThrow, requireFeature } from "@/server/context";
import { prisma } from "@/server/db";
import { normalizeUserId } from "@/lib/identifiers";
import { parseLogFile } from "@/lib/terminal/adms";
import {
  ingestTerminalRecords,
  queueRosterSync,
  reprocessUnmatched,
  terminalTime,
} from "@/server/services/terminals";

const ipRule = z
  .string()
  .trim()
  .regex(
    /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[0-9a-f:]+$/i,
    "Use an IP like 203.0.113.7 or a range like 203.0.113.0/24",
  );

const terminalSchema = z.object({
  name: z.string().trim().min(2, "Name the terminal").max(60),
  serialNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{4,40}$/, "Enter the serial number from the terminal's System Info screen"),
  locationId: z.string().nullish(),
  useStatusKeys: z.boolean().default(false),
  allowedIps: z.array(ipRule).max(20).default([]),
});

async function adminCtx() {
  const ctx = await getContextOrThrow("ADMIN");
  requireFeature(ctx, "biometricDevices");
  return ctx;
}

export async function saveTerminalAction(id: string | null, input: unknown) {
  return run(
    async () => {
      const ctx = await adminCtx();
      const t = terminalSchema.parse(input);
      if (t.locationId && !(await ctx.db.location.findUnique({ where: { id: t.locationId } })))
        throw new UserError("Choose a branch.");
      const taken = await prisma.attendanceDevice.findUnique({ where: { serialNumber: t.serialNumber } });
      if (taken && taken.id !== id) {
        throw new UserError(
          taken.companyId === ctx.company.id
            ? `That terminal is already added as ${taken.name}.`
            : "That terminal is registered to another company. Contact ClockTime support if it's yours.",
        );
      }
      const data = { ...t, locationId: t.locationId || null };
      const saved = id
        ? await ctx.db.attendanceDevice.update({ where: { id }, data })
        : await ctx.db.attendanceDevice.create({ data: { ...data, companyId: ctx.company.id } });
      await prisma.unclaimedTerminal.deleteMany({ where: { serialNumber: t.serialNumber } });
      await writeAudit(actorFrom(ctx), {
        action: id ? "terminal.update" : "terminal.create",
        entityType: "AttendanceDevice",
        entityId: saved.id,
        after: data,
      });
      if (!id) await queueRosterSync(ctx.company.id);
      revalidatePath("/app/settings/devices");
    },
    id ? "Terminal saved." : "Terminal added. Its user list is queued for sync.",
  );
}

export async function setTerminalStatusAction(id: string, active: boolean) {
  return run(
    async () => {
      const ctx = await adminCtx();
      await ctx.db.attendanceDevice.update({
        where: { id },
        data: { status: active ? "ACTIVE" : "DISABLED" },
      });
      await writeAudit(actorFrom(ctx), {
        action: active ? "terminal.enable" : "terminal.disable",
        entityType: "AttendanceDevice",
        entityId: id,
      });
      revalidatePath("/app/settings/devices");
    },
    active ? "Terminal enabled." : "Terminal disabled. It can no longer upload punches.",
  );
}

export async function removeTerminalAction(id: string) {
  return run(async () => {
    const ctx = await adminCtx();
    const t = await ctx.db.attendanceDevice.findUnique({ where: { id } });
    if (!t) throw new UserError("Terminal not found.");
    await ctx.db.attendanceDevice.delete({ where: { id } });
    await writeAudit(actorFrom(ctx), {
      action: "terminal.delete",
      entityType: "AttendanceDevice",
      entityId: id,
      before: t,
    });
    revalidatePath("/app/settings/devices");
  }, "Terminal removed. Its punches stay in the log.");
}

export async function syncRosterAction() {
  return run(async () => {
    const ctx = await adminCtx();
    const n = await queueRosterSync(ctx.company.id);
    revalidatePath("/app/settings/devices");
    return n;
  });
}

/** Give an unknown terminal user ID to an employee, then turn its stored records into punches. */
export async function linkTerminalUserAction(userId: string, employeeId: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("HR");
    requireFeature(ctx, "biometricDevices");
    const id = normalizeUserId(userId);
    const taken = await ctx.db.employee.findFirst({ where: { deviceUserId: id } });
    if (taken && taken.id !== employeeId)
      throw new UserError("That terminal ID is already linked to someone else.");
    const emp = await ctx.db.employee.update({ where: { id: employeeId }, data: { deviceUserId: id } });
    await writeAudit(actorFrom(ctx), {
      action: "terminal.linkUser",
      entityType: "Employee",
      entityId: emp.id,
      after: { deviceUserId: id },
    });
    const r = await reprocessUnmatched(ctx.company);
    revalidatePath("/app/settings/devices");
    return r;
  });
}

const importSchema = z.object({
  deviceId: z.string().nullish(),
  dryRun: z.boolean(),
});

/** Import an exported log (ZKTeco attlog.dat or CSV). Preview first, then import. */
export async function importTerminalLogAction(formData: FormData) {
  return run(async () => {
    const ctx = await getContextOrThrow("HR");
    requireFeature(ctx, "biometricDevices");
    const opts = importSchema.parse({
      deviceId: formData.get("deviceId") || null,
      dryRun: formData.get("dryRun") === "1",
    });
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a log file.");
    if (file.size > 5_000_000) throw new UserError("That file is over 5 MB. Split it by month.");
    const device = opts.deviceId
      ? await ctx.db.attendanceDevice.findUnique({ where: { id: opts.deviceId } })
      : null;
    const { records, errors } = parseLogFile(await file.text());
    if (!records.length)
      throw new UserError(
        "No punches found. Export the attendance log (attlog) or a CSV with user ID and time.",
      );
    const tz = ctx.company.timezone;
    const result = await ingestTerminalRecords(
      ctx.company,
      device,
      records.map((r) => ({
        userId: r.userId,
        at: terminalTime(r.local, tz),
        action: r.action,
        method: "FINGERPRINT",
      })),
      "IMPORT",
      { dryRun: opts.dryRun },
    );
    if (!opts.dryRun)
      await writeAudit(actorFrom(ctx), {
        action: "terminal.import",
        entityType: "AttendanceDevice",
        entityId: device?.id ?? null,
        after: { file: file.name, ...result, parseErrors: errors.length },
      });
    revalidatePath("/app/settings/devices");
    return { ...result, parseErrors: errors.length, firstErrors: errors.slice(0, 3), dryRun: opts.dryRun };
  });
}

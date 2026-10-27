"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { companySettingsSchema, parseSettings } from "@/lib/settings";
import { keyToUtcDate } from "@/lib/time";
import { run, UserError } from "@/server/action";
import { actorFrom, writeAudit } from "@/server/audit";
import { getContextOrThrow } from "@/server/context";
import { prisma } from "@/server/db";

const generalSchema = z.object({
  name: z.string().trim().min(2).max(100),
  industry: z.string().trim().max(60).optional(),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
  payFrequency: z.enum(["WEEKLY", "SEMI_MONTHLY", "MONTHLY"]),
});

export async function saveGeneralAction(input: unknown) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    const data = generalSchema.parse(input);
    await prisma.company.update({ where: { id: ctx.company.id }, data });
    await writeAudit(actorFrom(ctx), {
      action: "company.update",
      entityType: "Company",
      entityId: ctx.company.id,
      before: {
        name: ctx.company.name,
        payFrequency: ctx.company.payFrequency,
        timezone: ctx.company.timezone,
      },
      after: data,
    });
    revalidatePath("/app", "layout");
  }, "Company settings saved.");
}

/** Merge a partial update into Company.settings, validating the whole object. */
export async function saveSettingsAction(patch: Record<string, unknown>) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    const before = parseSettings(ctx.company.settings);
    const next = companySettingsSchema.parse({ ...before, ...patch });
    await prisma.company.update({ where: { id: ctx.company.id }, data: { settings: next } });
    const changed = Object.fromEntries(
      Object.entries(next).filter(([k, v]) => before[k as keyof typeof before] !== v),
    );
    await writeAudit(actorFrom(ctx), {
      action: "company.settings",
      entityType: "Company",
      entityId: ctx.company.id,
      before: Object.fromEntries(Object.keys(changed).map((k) => [k, before[k as keyof typeof before]])),
      after: changed,
    });
    revalidatePath("/app", "layout");
  }, "Settings saved.");
}

const holidaySchema = z.object({
  date: z.iso.date(),
  name: z.string().trim().min(2).max(100),
  type: z.enum(["REGULAR", "SPECIAL_NON_WORKING", "SPECIAL_WORKING"]),
});

export async function addHolidayAction(input: unknown) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    const h = holidaySchema.parse(input);
    const exists = await prisma.holiday.findFirst({
      where: { companyId: ctx.company.id, date: keyToUtcDate(h.date), name: h.name },
    });
    if (exists) throw new UserError("That holiday is already on your calendar.");
    await prisma.holiday.create({
      data: { companyId: ctx.company.id, date: keyToUtcDate(h.date), name: h.name, type: h.type },
    });
    await writeAudit(actorFrom(ctx), { action: "holiday.create", entityType: "Holiday", after: h });
    revalidatePath("/app/settings/holidays");
  }, "Holiday added.");
}

export async function deleteHolidayAction(id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    const h = await prisma.holiday.findFirst({ where: { id, companyId: ctx.company.id } });
    if (!h) throw new UserError("Only your company's own holidays can be removed.");
    await prisma.holiday.delete({ where: { id } });
    await writeAudit(actorFrom(ctx), {
      action: "holiday.delete",
      entityType: "Holiday",
      entityId: id,
      before: h,
    });
    revalidatePath("/app/settings/holidays");
  }, "Holiday removed.");
}

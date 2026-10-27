"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fixedHolidaysFor } from "@/lib/pay/holidays-ph";
import { PREMIUMS_DOLE } from "@/lib/pay/premiums";
import { keyToUtcDate } from "@/lib/time";
import { run, UserError } from "@/server/action";
import { requireSuperAdmin } from "@/server/admin";
import { prisma } from "@/server/db";

async function audit(
  actor: string,
  action: string,
  entityType: string,
  entityId: string | null,
  after?: unknown,
  companyId?: string,
) {
  await prisma.auditLog.create({
    data: {
      companyId: companyId ?? null,
      actorLabel: `ClockTime admin (${actor})`,
      action,
      entityType,
      entityId,
      after: after === undefined ? undefined : JSON.parse(JSON.stringify(after)),
    },
  });
}

const planSchema = z.object({
  plan: z.enum(["FREE", "STARTER", "PRO", "ENTERPRISE"]),
  planStatus: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"]),
  paidThrough: z.iso.date().nullable(),
  trialEndsAt: z.iso.date().nullable(),
});

export async function setCompanyPlanAction(companyId: string, data: unknown) {
  return run(async () => {
    const admin = await requireSuperAdmin();
    const v = planSchema.parse(data);
    await prisma.company.update({
      where: { id: companyId },
      data: {
        plan: v.plan,
        planStatus: v.planStatus,
        paidThrough: v.paidThrough ? keyToUtcDate(v.paidThrough) : null,
        trialEndsAt: v.trialEndsAt ? keyToUtcDate(v.trialEndsAt) : null,
      },
    });
    await audit(admin.email, "admin.plan.set", "Company", companyId, v, companyId);
    revalidatePath("/admin");
  }, "Plan updated.");
}

const num = z.number().nonnegative();
const bracket = z.object({ over: num, base: num, rate: z.number().min(0).max(1) });
const SCHEMAS = {
  SSS: z.object({
    eeRate: num,
    erRate: num,
    mscMin: num,
    mscMax: num,
    mscStep: z.number().positive(),
    regularMscMax: num,
    ecLow: num,
    ecHigh: num,
    ecThreshold: num,
  }),
  PHILHEALTH: z.object({ rate: num, floor: num, ceiling: num }),
  PAGIBIG: z.object({ eeRateLow: num, eeRateHigh: num, lowThreshold: num, erRate: num, maxFundSalary: num }),
  WITHHOLDING_TAX: z.object({
    DAILY: z.array(bracket).min(2),
    WEEKLY: z.array(bracket).min(2),
    SEMI_MONTHLY: z.array(bracket).min(2),
    MONTHLY: z.array(bracket).min(2),
  }),
  PREMIUMS: z.object({
    multipliers: z.record(
      z.enum(Object.keys(PREMIUMS_DOLE.multipliers) as [string, ...string[]]),
      z.object({ regular: num, overtime: num }),
    ),
    nightDiffRate: num,
  }),
} as const;

export async function saveStatutoryAction(input: {
  kind: string;
  effectiveFrom: string;
  version: string;
  source: string;
  json: string;
}) {
  return run(async () => {
    const admin = await requireSuperAdmin();
    const kind = z.enum(["SSS", "PHILHEALTH", "PAGIBIG", "WITHHOLDING_TAX", "PREMIUMS"]).parse(input.kind);
    const effectiveFrom = z.iso.date().parse(input.effectiveFrom);
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.json);
    } catch {
      throw new UserError("That isn't valid JSON.");
    }
    const data = SCHEMAS[kind].parse(parsed);
    const version = z.string().trim().min(3).parse(input.version);
    await prisma.statutoryTable.upsert({
      where: { kind_effectiveFrom: { kind, effectiveFrom: keyToUtcDate(effectiveFrom) } },
      create: {
        kind,
        effectiveFrom: keyToUtcDate(effectiveFrom),
        version,
        data,
        source: input.source || null,
      },
      update: { version, data, source: input.source || null },
    });
    await audit(admin.email, "admin.statutory.save", "StatutoryTable", `${kind}:${effectiveFrom}`, {
      version,
    });
    revalidatePath("/admin/statutory");
  }, "Table saved. Pay runs with a pay date on or after the effective date will use it.");
}

const holidaySchema = z.object({
  date: z.iso.date(),
  name: z.string().trim().min(2),
  type: z.enum(["REGULAR", "SPECIAL_NON_WORKING", "SPECIAL_WORKING"]),
});

export async function addNationalHolidayAction(data: unknown) {
  return run(async () => {
    const admin = await requireSuperAdmin();
    const h = holidaySchema.parse(data);
    await prisma.holiday.create({ data: { date: keyToUtcDate(h.date), name: h.name, type: h.type } });
    await audit(admin.email, "admin.holiday.add", "Holiday", null, h);
    revalidatePath("/admin/holidays");
  }, "Holiday added for every company.");
}

export async function deleteNationalHolidayAction(id: string) {
  return run(async () => {
    const admin = await requireSuperAdmin();
    const h = await prisma.holiday.findFirst({ where: { id, companyId: null } });
    if (!h) throw new UserError("Not found.");
    await prisma.holiday.delete({ where: { id } });
    await audit(admin.email, "admin.holiday.delete", "Holiday", id, h);
    revalidatePath("/admin/holidays");
  }, "Holiday removed.");
}

export async function loadFixedHolidaysAction(year: number) {
  return run(async () => {
    const admin = await requireSuperAdmin();
    let added = 0;
    for (const h of fixedHolidaysFor(year)) {
      const exists = await prisma.holiday.findFirst({
        where: { companyId: null, date: keyToUtcDate(h.date), name: h.name },
      });
      if (!exists) {
        await prisma.holiday.create({ data: { date: keyToUtcDate(h.date), name: h.name, type: h.type } });
        added++;
      }
    }
    await audit(admin.email, "admin.holiday.loadFixed", "Holiday", String(year), { added });
    revalidatePath("/admin/holidays");
    return added;
  });
}

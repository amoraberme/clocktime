import "server-only";
import { z } from "zod";
import { keyToUtcDate, parseHHMM } from "@/lib/time";
import { UserError } from "../action";
import { requireFeature, type AppContext } from "../context";
import { prisma } from "../db";

export const weeklyAvailabilitySchema = z.array(
  z.object({
    weekday: z.number().int().min(0).max(6),
    available: z.boolean(),
    start: z.string().default("08:00"),
    end: z.string().default("17:00"),
  }),
);

/** Replace an employee's weekly availability pattern (one window or "unavailable" per weekday). */
export async function saveWeeklyAvailability(ctx: AppContext, employeeId: string, raw: unknown) {
  requireFeature(ctx, "availability");
  if (employeeId !== ctx.employee.id && !ctx.isManager) throw new UserError("Not allowed.");
  const rows = weeklyAvailabilitySchema.parse(raw);
  const data = rows.map((r) => {
    const start = r.available ? parseHHMM(r.start) : 0;
    const end = r.available ? parseHHMM(r.end) : 1440;
    if (r.available && end <= start) throw new UserError("Each day's end time must be after its start time.");
    return {
      companyId: ctx.company.id,
      employeeId,
      weekday: r.weekday,
      startMinute: start,
      endMinute: end,
      available: r.available,
    };
  });
  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { companyId: ctx.company.id, employeeId, date: null } }),
    prisma.availability.createMany({ data }),
  ]);
}

export async function addUnavailableDate(ctx: AppContext, date: string, note?: string) {
  requireFeature(ctx, "availability");
  await prisma.availability.create({
    data: {
      companyId: ctx.company.id,
      employeeId: ctx.employee.id,
      date: keyToUtcDate(date),
      startMinute: 0,
      endMinute: 1440,
      available: false,
      note,
    },
  });
}

export async function removeAvailability(ctx: AppContext, id: string) {
  const row = await ctx.db.availability.findUnique({ where: { id } });
  if (!row || (row.employeeId !== ctx.employee.id && !ctx.isManager)) throw new UserError("Not found.");
  await ctx.db.availability.delete({ where: { id } });
}

import "server-only";
import type { CompanySettings } from "@/lib/settings";
import { prisma } from "../../db";
import { raiseRebuildIssues } from "../exceptions";
import { rebuildAttendance } from "./rebuild";

export type ScheduleChange = { employeeId: string | null; from: Date; to: Date };

/**
 * Re-pair attendance after the schedule changed, so punches always match the latest approved
 * schedule (e.g. a shift moved to nights after the person already tapped in). Future-only
 * changes have nothing to re-pair and are skipped.
 */
export async function rebuildForSchedule(
  company: { id: string; timezone: string; settings: CompanySettings },
  changes: ScheduleChange[],
) {
  const now = new Date();
  const horizon = now.getTime() + company.settings.lateWindowHours * 3600_000;
  for (const c of changes) {
    if (!c.employeeId || c.from.getTime() > horizon) continue;
    const employeeId = c.employeeId;
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeId}))`;
        return rebuildAttendance(tx, {
          companyId: company.id,
          timezone: company.timezone,
          settings: company.settings,
          employeeId,
          from: c.from,
          to: c.to,
          now,
        });
      },
      { timeout: 15_000 },
    );
    await raiseRebuildIssues(company.id, employeeId, company.timezone, result);
  }
}

import { z } from "zod";
import { hasFeature } from "@/lib/entitlements";
import { apiRoute, query } from "@/server/api-auth";
import type { AppContext } from "@/server/context";
import { filtersFromParams } from "@/server/reports/report-params";
import { cachedAttendanceReport } from "@/server/services/attendance-report";
import { currentPeriod } from "@/server/services/timesheets";

/** Cutoff attendance (daily DTR rows and per-employee totals) for payroll and HR systems. */
export const GET = apiRoute("reports", async (api, req) => {
  const q = query(req);
  const { start } = z.object({ start: z.iso.date().optional() }).parse(q);
  const ctx = {
    company: api.company,
    settings: api.settings,
    plan: api.plan,
    db: api.db,
    managedLocationIds: null,
    managedDepartmentIds: null,
    can: (f: Parameters<typeof hasFeature>[1]) => hasFeature(api.plan, f),
  } as unknown as AppContext;
  const period = currentPeriod(ctx, start);
  const report = await cachedAttendanceReport(ctx, period, filtersFromParams(q));
  return { period, summary: report.summary, daily: report.daily, branches: report.branches };
});

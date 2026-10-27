import { z } from "zod";
import { hasFeature } from "@/lib/entitlements";
import { apiRoute, query } from "@/server/api-auth";
import type { AppContext } from "@/server/context";
import { currentPeriod, teamPeriodSummary } from "@/server/services/timesheets";

export const GET = apiRoute("read", async (api, req) => {
  const { start } = z.object({ start: z.iso.date().optional() }).parse(query(req));
  // Reuse the dashboard summary with a read-only, company-wide context.
  const ctx = {
    company: api.company,
    settings: api.settings,
    plan: api.plan,
    db: api.db,
    managedLocationIds: null,
    can: (f: Parameters<typeof hasFeature>[1]) => hasFeature(api.plan, f),
  } as unknown as AppContext;
  const period = currentPeriod(ctx, start);
  const rows = await teamPeriodSummary(ctx, period);
  return {
    period,
    data: rows.map((r) => ({
      employeeId: r.employee.id,
      employeeNo: r.employee.employeeNo,
      status: r.timesheet?.status ?? "PENDING",
      minutes: r.hours.totals,
      grossEstimate: r.gross.gross / 100,
      earnings: r.gross.lines.map((l) => ({
        code: l.code,
        label: l.label,
        minutes: l.minutes,
        amount: l.amount / 100,
      })),
    })),
  };
});

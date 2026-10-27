import { apiRoute } from "@/server/api-auth";

export const GET = apiRoute("read", async (ctx) => {
  const runs = await ctx.db.payRun.findMany({ orderBy: { periodStart: "desc" }, take: 50 });
  return {
    data: runs.map((r) => ({
      id: r.id,
      kind: r.kind,
      periodStart: r.periodStart.toISOString().slice(0, 10),
      periodEnd: r.periodEnd.toISOString().slice(0, 10),
      payDate: r.payDate.toISOString().slice(0, 10),
      status: r.status,
      totals: r.totals,
    })),
  };
});

import { ApiError, apiRoute } from "@/server/api-auth";

const peso = (c: number) => c / 100;

export const GET = apiRoute<{ id: string }>("read", async (ctx, _req, { id }) => {
  const run = await ctx.db.payRun.findUnique({
    where: { id },
    include: {
      items: {
        include: { employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!run) throw new ApiError(404, "Pay run not found");
  if (run.status === "DRAFT" || run.status === "COMPUTED")
    throw new ApiError(409, "Pay run isn't finalized yet");
  return {
    id: run.id,
    status: run.status,
    payDate: run.payDate.toISOString().slice(0, 10),
    items: run.items.map((i) => ({
      employee: i.employee,
      gross: peso(i.grossCentavos),
      net: peso(i.netCentavos),
      sss: { ee: peso(i.sssEe), er: peso(i.sssEr), ec: peso(i.sssEc) },
      philhealth: { ee: peso(i.philhealthEe), er: peso(i.philhealthEr) },
      pagibig: { ee: peso(i.pagibigEe), er: peso(i.pagibigEr) },
      withholdingTax: peso(i.withholdingTax),
      earnings: i.earnings,
      deductions: i.deductions,
    })),
  };
});

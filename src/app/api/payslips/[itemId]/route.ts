import { getContextOrThrow } from "@/server/context";
import { storage } from "@/server/storage";

/** A payslip PDF: employees get their own finalized payslips; admins get any. */
export async function GET(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  let ctx;
  try {
    ctx = await getContextOrThrow();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const { itemId } = await params;
  const item = await ctx.db.payRunItem.findUnique({ where: { id: itemId }, include: { payRun: true } });
  if (!item || !item.payslipKey) return new Response("Not found", { status: 404 });
  const own =
    item.employeeId === ctx.employee.id &&
    (item.payRun.status === "FINALIZED" || item.payRun.status === "PAID");
  if (!own && !ctx.isHr) return new Response("Not found", { status: 404 });
  const pdf = await storage().get(item.payslipKey);
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="payslip-${item.payRun.payDate.toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

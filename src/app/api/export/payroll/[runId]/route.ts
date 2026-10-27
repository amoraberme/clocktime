import ExcelJS from "exceljs";
import { csvResponse } from "@/lib/csv";
import { centavosToPesos } from "@/lib/money";
import { utcDateToKey } from "@/lib/time";
import { getContextOrThrow } from "@/server/context";
import { decrypt } from "@/server/crypto";
import { actorFrom, writeAudit } from "@/server/audit";

const peso = (c: number) => Number(centavosToPesos(c).toFixed(2));

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  let ctx;
  try {
    ctx = await getContextOrThrow("HR");
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!ctx.can("payroll")) return new Response("Payroll needs the Pro plan", { status: 403 });
  const { runId } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "register-xlsx";
  const run = await ctx.db.payRun.findUnique({
    where: { id: runId },
    include: { items: { include: { employee: true }, orderBy: { employee: { lastName: "asc" } } } },
  });
  if (!run) return new Response("Not found", { status: 404 });
  await writeAudit(actorFrom(ctx), {
    action: "payroll.export",
    entityType: "PayRun",
    entityId: run.id,
    after: { format },
  });
  const base = `${ctx.company.slug}-payroll-${utcDateToKey(run.periodStart)}_${utcDateToKey(run.periodEnd)}`;
  const name = (e: { firstName: string; lastName: string }) => `${e.lastName}, ${e.firstName}`;

  if (format === "bank-csv") {
    return csvResponse(`${base}-bank.csv`, [
      ["Employee No", "Name", "Bank", "Account Number", "Net Pay (PHP)"],
      ...run.items
        .filter((i) => i.netCentavos > 0)
        .map((i) => [
          i.employee.employeeNo,
          name(i.employee),
          i.employee.bankName ?? "",
          decrypt(i.employee.bankAccountEnc) ?? "",
          peso(i.netCentavos).toFixed(2),
        ]),
    ]);
  }
  if (format === "contributions-csv") {
    return csvResponse(`${base}-contributions.csv`, [
      [
        "Employee No",
        "Name",
        "SSS No",
        "SSS EE",
        "SSS ER",
        "SSS EC",
        "PhilHealth No",
        "PhilHealth EE",
        "PhilHealth ER",
        "Pag-IBIG MID",
        "Pag-IBIG EE",
        "Pag-IBIG ER",
        "TIN",
        "Tax Withheld",
      ],
      ...run.items.map((i) => [
        i.employee.employeeNo,
        name(i.employee),
        decrypt(i.employee.sssEnc) ?? "",
        peso(i.sssEe).toFixed(2),
        peso(i.sssEr).toFixed(2),
        peso(i.sssEc).toFixed(2),
        decrypt(i.employee.philhealthEnc) ?? "",
        peso(i.philhealthEe).toFixed(2),
        peso(i.philhealthEr).toFixed(2),
        decrypt(i.employee.pagibigEnc) ?? "",
        peso(i.pagibigEe).toFixed(2),
        peso(i.pagibigEr).toFixed(2),
        decrypt(i.employee.tinEnc) ?? "",
        peso(i.withholdingTax).toFixed(2),
      ]),
    ]);
  }
  const header = [
    "Employee No",
    "Name",
    "Gross",
    "Basic",
    "SSS EE",
    "PhilHealth EE",
    "Pag-IBIG EE",
    "Taxable",
    "Withholding Tax",
    "Other Deductions",
    "Net Pay",
    "SSS ER+EC",
    "PhilHealth ER",
    "Pag-IBIG ER",
  ];
  const rows = run.items.map((i) => [
    i.employee.employeeNo ?? "",
    name(i.employee),
    peso(i.grossCentavos),
    peso(i.basicCentavos),
    peso(i.sssEe),
    peso(i.philhealthEe),
    peso(i.pagibigEe),
    peso(i.taxableCentavos),
    peso(i.withholdingTax),
    peso(i.otherDeductions),
    peso(i.netCentavos),
    peso(i.sssEr + i.sssEc),
    peso(i.philhealthEr),
    peso(i.pagibigEr),
  ]);
  if (format === "register-csv")
    return csvResponse(`${base}-register.csv`, [
      header,
      ...rows.map((r) => r.map((v) => (typeof v === "number" ? v.toFixed(2) : v))),
    ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "ClockTime";
  const ws = wb.addWorksheet("Payroll register");
  ws.addRow([`${ctx.company.name} payroll register`]).font = { bold: true, size: 14 };
  ws.addRow([
    `Period ${utcDateToKey(run.periodStart)} to ${utcDateToKey(run.periodEnd)} · pay date ${utcDateToKey(run.payDate)} · status ${run.status}`,
  ]);
  ws.addRow([]);
  const h = ws.addRow(header);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } }));
  for (const r of rows) ws.addRow(r);
  const first = 5;
  const last = first + rows.length - 1;
  const totals = ws.addRow([
    "",
    "TOTAL",
    ...header.slice(2).map((_, i) => ({
      formula: `SUM(${String.fromCharCode(67 + i)}${first}:${String.fromCharCode(67 + i)}${last})`,
    })),
  ]);
  totals.font = { bold: true };
  ws.columns.forEach((col, i) => {
    col.width = i === 1 ? 28 : 14;
    if (i >= 2) col.numFmt = "#,##0.00";
  });
  ws.views = [{ state: "frozen", ySplit: 4, xSplit: 2 }];
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}-register.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Writes the sample cutoff report from the Demo Logistics Corp data (run `pnpm demo:enterprise`
 * first), using the same report code as the app's Reports page and export.
 *
 * Run: pnpm report:sample  →  docs/samples/clocktime-cutoff-report-sample.xlsx (+ CSVs)
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { toCsv } from "../src/lib/csv";
import { hasFeature } from "../src/lib/entitlements";
import { parseSettings } from "../src/lib/settings";
import { payPeriodFor, previousPayPeriod } from "../src/lib/time";
import type { AppContext } from "../src/server/context";
import { prisma } from "../src/server/db";
import { attendanceCsvRows, attendanceWorkbook } from "../src/server/reports/attendance-workbook";
import { buildAttendanceReport } from "../src/server/services/attendance-report";
import { tenantDb } from "../src/server/tenant";

async function main() {
  const company = await prisma.company.findUnique({ where: { slug: "demo-logistics" } });
  if (!company) throw new Error("Run `pnpm demo:enterprise` first.");
  const ctx = {
    company,
    settings: parseSettings(company.settings),
    plan: company.plan,
    can: (f: Parameters<typeof hasFeature>[1]) => hasFeature(company.plan, f),
    db: tenantDb(company.id),
    managedLocationIds: null,
    managedDepartmentIds: null,
  } as unknown as AppContext;
  const opts = { weekStartsOn: 1 as const, payDateOffsetDays: 5 };
  const today = new Date().toISOString().slice(0, 10);
  const period = previousPayPeriod(payPeriodFor(today, "SEMI_MONTHLY", opts), "SEMI_MONTHLY", opts);
  const report = await buildAttendanceReport(ctx, period);
  const dir = "docs/samples";
  await mkdir(dir, { recursive: true });
  const xlsx = `${dir}/clocktime-cutoff-report-sample.xlsx`;
  await writeFile(xlsx, await attendanceWorkbook(report, "Bea Santos (HR)"));
  await writeFile(`${dir}/clocktime-cutoff-summary-sample.csv`, toCsv(attendanceCsvRows(report, "summary")));
  await writeFile(`${dir}/clocktime-cutoff-daily-dtr-sample.csv`, toCsv(attendanceCsvRows(report, "daily")));
  console.log(
    `Wrote ${xlsx}: ${report.summary.length} employees, ${report.daily.length} daily rows, ${report.branches.length} branches, ${report.daily.filter((d) => d.needsReview).length} days for review`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

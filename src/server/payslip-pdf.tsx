import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Company, Employee, PayRun, PayRunItem, Position } from "@/generated/prisma/client";
import { utcDateToKey } from "@/lib/time";
import { decrypt, mask } from "./crypto";

// Built-in Helvetica has no ₱ glyph, so amounts use "PHP".
const money = (c: number) =>
  `PHP ${(c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#0f172a" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: "2pt solid #0f766e",
    paddingBottom: 10,
    marginBottom: 14,
  },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#0f766e" },
  muted: { color: "#64748b" },
  h2: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 6, marginTop: 4 },
  grid: { flexDirection: "row", gap: 18 },
  col: { flex: 1 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2.5,
    borderBottom: "0.5pt solid #e2e8f0",
  },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    fontFamily: "Helvetica-Bold",
  },
  net: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#ccfbf1",
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  small: { fontSize: 7.5, color: "#64748b", marginTop: 18 },
  info: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  infoItem: { width: "50%", paddingVertical: 2 },
});

type Line = { label: string; amount: number; minutes?: number; days?: number };

export async function renderPayslipPdf({
  company,
  run,
  item,
  employee,
}: {
  company: Company;
  run: PayRun;
  item: PayRunItem;
  employee: Employee & { position: Position | null };
}) {
  const earnings = item.earnings as Line[];
  const deductions = item.deductions as Line[];
  const ded = deductions.reduce((t, d) => t + d.amount, 0);
  const period =
    run.kind === "THIRTEENTH_MONTH"
      ? `${run.periodStart.getUTCFullYear()} 13th-month pay`
      : `${utcDateToKey(run.periodStart)} to ${utcDateToKey(run.periodEnd)}`;
  const versions = item.tableVersions as Record<string, string>;
  const doc = (
    <Document
      title={`Payslip ${employee.firstName} ${employee.lastName} ${utcDateToKey(run.payDate)}`}
      author="ClockTime"
    >
      <Page size="A5" orientation="landscape" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>{company.name}</Text>
            <Text style={s.muted}>Payslip · {period}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text>Pay date: {utcDateToKey(run.payDate)}</Text>
            <Text style={s.muted}>Ref {item.id.slice(-8).toUpperCase()}</Text>
          </View>
        </View>
        <View style={s.info}>
          <Text style={s.infoItem}>
            Employee: {employee.firstName} {employee.lastName} (#{employee.employeeNo})
          </Text>
          <Text style={s.infoItem}>Position: {employee.position?.name ?? "—"}</Text>
          <Text style={s.infoItem}>TIN: {mask(decrypt(employee.tinEnc)) || "—"}</Text>
          <Text style={s.infoItem}>SSS: {mask(decrypt(employee.sssEnc)) || "—"}</Text>
        </View>
        <View style={s.grid}>
          <View style={s.col}>
            <Text style={s.h2}>Earnings</Text>
            {earnings.map((e, i) => (
              <View key={i} style={s.row}>
                <Text>
                  {e.label}
                  {e.minutes ? ` · ${(e.minutes / 60).toFixed(2)}h` : e.days ? ` · ${e.days}d` : ""}
                </Text>
                <Text>{money(e.amount)}</Text>
              </View>
            ))}
            <View style={s.total}>
              <Text>Gross pay</Text>
              <Text>{money(item.grossCentavos)}</Text>
            </View>
          </View>
          <View style={s.col}>
            <Text style={s.h2}>Deductions</Text>
            {deductions.length === 0 ? <Text style={s.muted}>None</Text> : null}
            {deductions.map((d, i) => (
              <View key={i} style={s.row}>
                <Text>{d.label}</Text>
                <Text>{money(d.amount)}</Text>
              </View>
            ))}
            <View style={s.total}>
              <Text>Total deductions</Text>
              <Text>{money(ded)}</Text>
            </View>
            <Text style={[s.h2, { marginTop: 10 }]}>Employer share (not deducted)</Text>
            <View style={s.row}>
              <Text>SSS + EC</Text>
              <Text>{money(item.sssEr + item.sssEc)}</Text>
            </View>
            <View style={s.row}>
              <Text>PhilHealth</Text>
              <Text>{money(item.philhealthEr)}</Text>
            </View>
            <View style={s.row}>
              <Text>Pag-IBIG</Text>
              <Text>{money(item.pagibigEr)}</Text>
            </View>
          </View>
        </View>
        <View style={s.net}>
          <Text>Net pay</Text>
          <Text>{money(item.netCentavos)}</Text>
        </View>
        <Text style={s.small}>
          Generated by ClockTime. Rates: {Object.values(versions ?? {}).join(" · ") || "built-in"}. This
          payslip is confidential.
        </Text>
      </Page>
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}

import type { Metadata } from "next";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PLANS, type Feature } from "@/config/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free for 2 people. Starter and Pro plans with one price for all your locations, and Enterprise for nationwide teams.",
};

const ROWS: [string, Feature][] = [
  ["GPS clock in/out, offline punches", "clock"],
  ["Weekly schedule & timesheets", "basicSchedule"],
  ["CSV export", "csvExport"],
  ["Geofencing & auto clock-out", "geofence"],
  ["Kiosk with PIN / QR badges", "kiosk"],
  ["Recurring & open shifts, swaps", "openShifts"],
  ["Availability & auto-scheduling", "autoSchedule"],
  ["Leave & overtime requests", "leave"],
  ["Timesheet approvals & exception inbox", "exceptions"],
  ["Multiple locations", "multiLocation"],
  ["Photo proof, device & IP locks", "photoProof"],
  ["Payroll: SSS, PhilHealth, Pag-IBIG, BIR", "payroll"],
  ["Payslips, 13th month, bank file", "payroll"],
  ["Labor insights", "insights"],
  ["REST API", "api"],
  ["Cutoff DTR reports (Excel/CSV)", "attendanceReports"],
  ["Fingerprint & RFID terminals", "biometricDevices"],
  ["Regions, HR & timekeeper roles", "hrRoles"],
  ["Two-level approvals", "multiLevelApproval"],
  ["Field mode for drivers & sales", "fieldMode"],
  ["Nationwide consolidated reports", "consolidatedReports"],
  ["Webhooks & payroll export templates", "webhooks"],
];

const TIERS = ["FREE", "STARTER", "PRO", "ENTERPRISE"] as const;

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-center text-4xl font-bold tracking-tight">Pricing</h1>
      <p className="text-muted-foreground mx-auto mt-3 mb-12 max-w-xl text-center">
        Pick a plan for your team size. Every paid plan starts with a 14-day free trial.
      </p>
      <PricingCards />
      <h2 className="mt-20 mb-6 text-2xl font-semibold">Compare plans</h2>
      <div className="bg-card rounded-2xl border">
        <Table>
          <THead>
            <tr>
              <TH>Feature</TH>
              {TIERS.map((p) => (
                <TH key={p} className="text-center">
                  {PLANS[p].name}
                </TH>
              ))}
            </tr>
          </THead>
          <TBody>
            {ROWS.map(([label, f], i) => (
              <TR key={i}>
                <TD>{label}</TD>
                {TIERS.map((p) => (
                  <TD key={p} className="text-center">
                    {PLANS[p].features.includes(f) ? (
                      <span className="text-primary">✓</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TD>
                ))}
              </TR>
            ))}
            <TR>
              <TD>Team size</TD>
              <TD className="text-center">2</TD>
              <TD className="text-center">Unlimited</TD>
              <TD className="text-center">Unlimited</TD>
              <TD className="text-center">Unlimited</TD>
            </TR>
          </TBody>
        </Table>
      </div>
    </main>
  );
}

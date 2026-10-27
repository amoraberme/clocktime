import type { Metadata } from "next";
import { FieldMapLoader } from "@/components/field/field-map-loader";
import { UpgradeCard } from "@/components/upgrade-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { INTEGRITY_LABELS, type IntegrityFlag } from "@/lib/attendance/integrity";
import { addDays, dateKey, formatTime, startOfDay } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import { employeeScopeWhere } from "@/server/scope";

export const metadata: Metadata = { title: "Field staff" };

const ACTIONS: Record<string, string> = {
  CLOCK_IN: "Clock in",
  CLOCK_OUT: "Clock out",
  BREAK_START: "Break",
  BREAK_END: "Back from break",
  TOGGLE: "Tap",
};

export default async function FieldPage() {
  const ctx = await requireContext("MANAGER");
  if (!ctx.can("fieldMode"))
    return (
      <>
        <PageHeader title="Field staff" />
        <UpgradeCard
          feature="fieldMode"
          title="Drivers and sales on the road"
          description="GPS and selfie on every punch, anti-buddy-punching checks and a map of today's field punches."
        />
      </>
    );
  const tz = ctx.company.timezone;
  const today = dateKey(new Date(), tz);
  const [punches, branches] = await Promise.all([
    ctx.db.punch.findMany({
      where: {
        accepted: true,
        voidedAt: null,
        at: { gte: startOfDay(today, tz), lt: startOfDay(addDays(today, 1), tz) },
        employee: { fieldWork: true, ...employeeScopeWhere(ctx) },
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { at: "desc" },
    }),
    ctx.db.location.findMany({
      where: { archivedAt: null, latitude: { not: null } },
      select: { name: true, latitude: true, longitude: true },
    }),
  ]);
  const describe = (flags: string[]) =>
    flags
      .map((f) => INTEGRITY_LABELS[f as IntegrityFlag])
      .filter(Boolean)
      .join("; ");
  return (
    <>
      <PageHeader
        title="Field staff today"
        description="Where drivers and sales punched in and out. Only punch locations are recorded, never a live trail."
      />
      <FieldMapLoader
        points={punches
          .filter((p) => p.lat != null && p.lng != null)
          .map((p) => ({
            id: p.id,
            name: fullName(p.employee),
            lat: p.lat!,
            lng: p.lng!,
            label: `${ACTIONS[p.action]} ${formatTime(p.at, tz)}${p.accuracy ? ` · ±${Math.round(p.accuracy)} m` : ""}${p.flags.length ? ` · ${describe(p.flags)}` : ""}`,
            flagged: p.flags.length > 0,
          }))}
        branches={branches.map((b) => ({ name: b.name, lat: b.latitude!, lng: b.longitude! }))}
      />
      <Card className="mt-6">
        <Table>
          <THead>
            <tr>
              <TH>Time</TH>
              <TH>Person</TH>
              <TH>Punch</TH>
              <TH>GPS</TH>
              <TH>Checks</TH>
            </tr>
          </THead>
          <TBody>
            {punches.length === 0 ? (
              <TR>
                <TD colSpan={5} className="text-muted-foreground text-center">
                  No field punches yet today.
                </TD>
              </TR>
            ) : (
              punches.map((p) => (
                <TR key={p.id}>
                  <TD className="tabular">{formatTime(p.at, tz)}</TD>
                  <TD className="font-medium">{fullName(p.employee)}</TD>
                  <TD>
                    {ACTIONS[p.action]}
                    {p.offline ? <Badge className="ml-2">synced offline</Badge> : null}
                  </TD>
                  <TD className="text-sm">
                    {p.lat != null ? `${p.lat.toFixed(5)}, ${p.lng!.toFixed(5)}` : "—"}
                    {p.accuracy ? (
                      <span className="text-muted-foreground"> ±{Math.round(p.accuracy)} m</span>
                    ) : null}
                  </TD>
                  <TD>
                    {p.flags.length ? (
                      <Badge tone="danger">{describe(p.flags)}</Badge>
                    ) : (
                      <Badge tone="success">ok</Badge>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

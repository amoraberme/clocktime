import { Tablet } from "lucide-react";
import Link from "next/link";
import { AddKiosk, RevokeDevice } from "@/components/settings/kiosk-controls";
import { UpgradeCard } from "@/components/upgrade-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/time";
import { requireContext } from "@/server/context";

export default async function KiosksPage() {
  const ctx = await requireContext("ADMIN");
  if (!ctx.can("kiosk")) {
    return (
      <UpgradeCard
        feature="kiosk"
        title="Turn a tablet into a time clock"
        description="Mount a tablet at the entrance. Staff punch with a PIN or QR badge, with optional photo proof. Works offline."
      />
    );
  }
  const [devices, locations, withoutPin, rejected] = await Promise.all([
    ctx.db.device.findMany({
      where: { kind: "KIOSK", revokedAt: null },
      include: { location: true },
      orderBy: { createdAt: "desc" },
    }),
    ctx.db.location.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
    ctx.db.employee.count({ where: { status: "ACTIVE", pinHash: null } }),
    ctx.db.deviceLog.findMany({
      where: { kind: "KIOSK_REJECT", createdAt: { gte: daysAgo(14) } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Kiosk tablets</CardTitle>
            <CardDescription>
              Any tablet or phone with a browser works. Add it to the home screen for full-screen mode.
            </CardDescription>
          </div>
          <AddKiosk locations={locations} appUrl={appUrl} />
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <EmptyState icon={Tablet} title="No kiosks yet" description="Add one to get a pairing code." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Location</TH>
                  <TH>Status</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {devices.map((d) => (
                  <TR key={d.id}>
                    <TD className="font-medium">{d.name}</TD>
                    <TD>{d.location?.name ?? "—"}</TD>
                    <TD>
                      {d.pairingCode ? (
                        <Badge tone="warning">Waiting to pair · code {d.pairingCode}</Badge>
                      ) : d.lastSeenAt ? (
                        <span className="text-muted-foreground text-sm">
                          Last active {formatDateTime(d.lastSeenAt, ctx.company.timezone)}
                        </span>
                      ) : (
                        <Badge>Paired</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <RevokeDevice id={d.id} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {rejected.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Offline punches that didn&apos;t sync</CardTitle>
            <CardDescription>
              Punched on a kiosk while offline, then rejected (e.g. a wrong PIN). Add them as a correction if
              they were real.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {rejected.map((r) => (
                <li key={r.id}>
                  <span className="text-muted-foreground">
                    {formatDateTime(r.createdAt, ctx.company.timezone)} ·{" "}
                  </span>
                  {r.raw}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Badges & PINs</CardTitle>
          <CardDescription>
            {withoutPin
              ? `${withoutPin} active people have no PIN yet. They can set one in their profile, or you can set it on their team page.`
              : "Everyone has a PIN."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/print/badges" target="_blank">
              Print QR badges for everyone
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

import { Fingerprint } from "lucide-react";
import { UpgradeCard } from "@/components/upgrade-card";
import {
  AddTerminal,
  LinkTerminalUser,
  LogImport,
  SyncRosterButton,
  TerminalRowActions,
} from "@/components/settings/terminals";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import { prisma } from "@/server/db";
import { isOnline } from "@/server/services/terminals";

export default async function TerminalsPage() {
  const ctx = await requireContext("HR");
  if (!ctx.can("biometricDevices"))
    return (
      <UpgradeCard
        feature="biometricDevices"
        title="Fingerprint and RFID terminals"
        description="Connect ZKTeco-style terminals at every branch; punches upload to one employee record."
      />
    );
  const tz = ctx.company.timezone;
  const [terminals, locations, unmatched, employees] = await Promise.all([
    ctx.db.attendanceDevice.findMany({
      orderBy: { name: "asc" },
      include: {
        location: { select: { name: true } },
        _count: { select: { commands: { where: { status: { in: ["PENDING", "SENT"] } } } } },
      },
    }),
    ctx.db.location.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    ctx.db.deviceLog.groupBy({
      by: ["userId", "deviceId"],
      where: { kind: "ATTLOG", status: "UNMATCHED" },
      _count: true,
      _max: { at: true },
    }),
    ctx.db.employee.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNo: true },
    }),
  ]);
  const host = (process.env.APP_URL ?? "https://app.clocktime.ph")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const failed = await prisma.deviceCommand.count({
    where: { deviceId: { in: terminals.map((t) => t.id) }, status: "FAILED" },
  });
  const name = new Map(terminals.map((t) => [t.id, t.name]));
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Terminals</CardTitle>
            <CardDescription>
              Fingerprint, face and RFID card terminals push punches to ClockTime over the internet. Staff are
              matched by their terminal user ID (or employee no.), so every method lands on one record.
            </CardDescription>
          </div>
          {ctx.isAdmin ? (
            <div className="flex gap-2">
              {terminals.length ? <SyncRosterButton /> : null}
              <AddTerminal locations={locations} />
            </div>
          ) : null}
        </CardHeader>
        {terminals.length === 0 ? (
          <CardContent>
            <EmptyState
              icon={Fingerprint}
              title="No terminals yet"
              description="Add a terminal by its serial number, then point it at ClockTime."
            />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Terminal</TH>
                <TH>Branch</TH>
                <TH>Status</TH>
                <TH>Last seen</TH>
                <TH className="text-right">Queued</TH>
                {ctx.isAdmin ? <TH /> : null}
              </tr>
            </THead>
            <TBody>
              {terminals.map((t) => {
                const online = isOnline(t);
                return (
                  <TR key={t.id}>
                    <TD>
                      <span className="font-medium">{t.name}</span>
                      <span className="text-muted-foreground block font-mono text-xs">{t.serialNumber}</span>
                    </TD>
                    <TD>{t.location?.name ?? "Any branch"}</TD>
                    <TD>
                      {t.status === "DISABLED" ? (
                        <Badge>disabled</Badge>
                      ) : !t.lastSeenAt ? (
                        <Badge tone="warning">waiting for first contact</Badge>
                      ) : online ? (
                        <Badge tone="success">online</Badge>
                      ) : (
                        <Badge tone="danger">offline</Badge>
                      )}
                    </TD>
                    <TD className="text-sm">
                      {t.lastSeenAt ? formatDateTime(t.lastSeenAt, tz) : "—"}
                      {t.lastIp ? (
                        <span className="text-muted-foreground block text-xs">{t.lastIp}</span>
                      ) : null}
                    </TD>
                    <TD className="tabular text-right">{t._count.commands || ""}</TD>
                    {ctx.isAdmin ? (
                      <TD>
                        <TerminalRowActions
                          active={t.status === "ACTIVE"}
                          locations={locations}
                          terminal={{
                            id: t.id,
                            name: t.name,
                            serialNumber: t.serialNumber,
                            locationId: t.locationId,
                            useStatusKeys: t.useStatusKeys,
                            allowedIps: t.allowedIps,
                          }}
                        />
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        {failed ? (
          <CardContent className="text-warning text-sm">
            {failed} user update{failed === 1 ? "" : "s"} failed on a terminal. Check its user capacity, then
            sync again.
          </CardContent>
        ) : null}
      </Card>

      {unmatched.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Unknown terminal IDs</CardTitle>
            <CardDescription>
              Punches from user IDs that don&apos;t match anyone yet. Link each to a person and the punches go
              to their timesheet.
            </CardDescription>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <TH>Terminal ID</TH>
                <TH>Terminal</TH>
                <TH className="text-right">Punches</TH>
                <TH>Latest</TH>
                <TH>Who is it?</TH>
              </tr>
            </THead>
            <TBody>
              {unmatched.map((u) => (
                <TR key={`${u.userId}|${u.deviceId}`}>
                  <TD className="font-mono">{u.userId}</TD>
                  <TD>{u.deviceId ? (name.get(u.deviceId) ?? "—") : "Imported file"}</TD>
                  <TD className="tabular text-right">{u._count}</TD>
                  <TD className="text-sm">{u._max.at ? formatDateTime(u._max.at, tz) : "—"}</TD>
                  <TD>
                    <LinkTerminalUser
                      userId={u.userId!}
                      employees={employees.map((e) => ({
                        id: e.id,
                        name: `${fullName(e)}${e.employeeNo ? ` · ${e.employeeNo}` : ""}`,
                      }))}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Import a terminal log</CardTitle>
          <CardDescription>
            For terminals that can&apos;t connect (or a branch that was offline): export the attendance log to
            USB and upload it here. Re-importing the same file never creates duplicates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogImport terminals={terminals.map((t) => ({ id: t.id, name: t.name }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connect a terminal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Add the terminal above with its serial number and branch.</li>
            <li>
              On the terminal open <b>Menu → COMM. → Cloud Server Setting</b> (ADMS) and set server address{" "}
              <code className="bg-muted rounded px-1">{host}</code>, port{" "}
              <code className="bg-muted rounded px-1">443</code>, HTTPS on, proxy off.
            </li>
            <li>The status turns online within a minute; staff names and RFID cards sync to the terminal.</li>
            <li>
              Enrol each person&apos;s fingerprint or face on the terminal under the same user ID shown on
              their profile.
            </li>
          </ol>
          <p className="text-muted-foreground">
            Fingerprint and face templates stay on the terminal; ClockTime receives only the user ID, time and
            verify method. Terminals keep punches while offline and upload them when the connection returns.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

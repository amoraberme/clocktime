import { ArrowLeft, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { EmployeeActions } from "@/components/team/employee-actions";
import { EditEmployee } from "@/components/team/edit-employee";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatPeso } from "@/lib/money";
import { formatKey, formatMinutes, formatTime, dateKey, utcDateToKey } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import { employeeScopeWhere } from "@/server/scope";
import { decrypt, mask } from "@/server/crypto";
import {
  computeEmployeePeriod,
  currentPeriod,
  loadEntries,
  loadPayInputs,
  todayKey,
} from "@/server/services/timesheets";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Team member" };
}

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext("MANAGER");
  const emp = await ctx.db.employee.findFirst({
    where: { id, ...employeeScopeWhere(ctx) },
    include: {
      position: true,
      department: true,
      locations: true,
      managedDepartments: { include: { department: { select: { name: true } } } },
      user: { select: { email: true } },
    },
  });
  if (!emp) notFound();
  const tz = ctx.company.timezone;
  const period = currentPeriod(ctx);
  const [locations, departments, positions, entries, inputs, devices] = await Promise.all([
    ctx.db.location.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
    ctx.db.department.findMany({ select: { name: true } }),
    ctx.db.position.findMany({ select: { name: true } }),
    loadEntries(ctx.company.id, [emp.id], period.start, period.end, tz),
    loadPayInputs(ctx, [emp.id], period),
    ctx.db.device.count({ where: { employeeId: emp.id, kind: "PERSONAL", revokedAt: null } }),
  ]);
  const summary = computeEmployeePeriod(ctx, emp, entries, period, inputs, todayKey(ctx));
  const qr = await QRCode.toDataURL(`clocktime:${emp.qrToken}`, { margin: 1, width: 240 });
  const masked = {
    tin: mask(decrypt(emp.tinEnc)),
    sss: mask(decrypt(emp.sssEnc)),
    philhealth: mask(decrypt(emp.philhealthEnc)),
    pagibig: mask(decrypt(emp.pagibigEnc)),
    bankAccount: mask(decrypt(emp.bankAccountEnc)),
  };

  return (
    <div className="space-y-6">
      <Link
        href="/app/team"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Team
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar firstName={emp.firstName} lastName={emp.lastName} color={emp.color} size="lg" />
          <div>
            <h1 className="text-2xl font-semibold">{fullName(emp)}</h1>
            <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              #{emp.employeeNo} {emp.position ? `· ${emp.position.name}` : ""}
              <Badge
                tone={emp.status === "ACTIVE" ? "success" : emp.status === "INVITED" ? "info" : "neutral"}
              >
                {emp.status.toLowerCase()}
              </Badge>
              <Badge tone="primary">{emp.role.toLowerCase()}</Badge>
            </p>
          </div>
        </div>
        <EmployeeActions
          id={emp.id}
          status={emp.status}
          hasEmail={!!emp.email}
          hasUser={!!emp.userId}
          hasPin={!!emp.pinHash}
          canArchive={emp.role !== "OWNER" && emp.id !== ctx.employee.id}
          hasDevice={devices > 0}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Hours this period"
          value={formatMinutes(summary.hours.totals.workedMinutes)}
          hint={`${formatKey(period.start)} – ${formatKey(period.end)}`}
        />
        <Stat label="Overtime" value={formatMinutes(summary.hours.totals.overtimeMinutes)} />
        <Stat label="Late" value={formatMinutes(summary.hours.totals.lateMinutes)} />
        {ctx.canViewPay ? <Stat label="Gross pay estimate" value={formatPeso(summary.gross.gross)} /> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader>
            <CardTitle>Profile & pay</CardTitle>
          </CardHeader>
          <CardContent>
            {!ctx.canViewPay ? (
              <p className="text-muted-foreground text-sm">
                Profile and pay details are managed by HR and admins.
              </p>
            ) : (
              <EditEmployee
                values={{
                  id: emp.id,
                  firstName: emp.firstName,
                  lastName: emp.lastName,
                  email: emp.email,
                  phone: emp.phone,
                  employeeNo: emp.employeeNo,
                  role: emp.role,
                  payType: emp.payType,
                  rate: emp.rateCentavos / 100,
                  workDaysPerYear: emp.workDaysPerYear,
                  isMinimumWageEarner: emp.isMinimumWageEarner,
                  timeExempt: emp.timeExempt,
                  restDays: emp.restDays,
                  hireDate: emp.hireDate ? utcDateToKey(emp.hireDate) : null,
                  departmentName: emp.department?.name,
                  positionName: emp.position?.name,
                  locationIds: emp.locations.map((l) => l.locationId),
                  bankName: emp.bankName,
                  deviceUserId: emp.deviceUserId,
                  cardLast4: emp.cardEnc ? (decrypt(emp.cardEnc) ?? "").slice(-4) : null,
                  fieldWork: emp.fieldWork,
                  roaming: emp.roaming,
                  managedDepartmentNames: emp.managedDepartments.map((d) => d.department.name),
                  masked,
                }}
                locations={locations}
                departments={departments.map((d) => d.name)}
                positions={positions.map((p) => p.name)}
                canAssignRoles={ctx.isAdmin || ctx.isHr}
                isOwner={emp.role === "OWNER"}
                features={{
                  hrRoles: ctx.can("hrRoles"),
                  terminals: ctx.can("biometricDevices"),
                  rfid: ctx.can("rfid"),
                  fieldMode: ctx.can("fieldMode"),
                }}
              />
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Kiosk badge</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt={`QR badge for ${fullName(emp)}`}
                className="mx-auto size-40 rounded border"
              />
              <p className="text-muted-foreground text-xs">
                Hold this up to the kiosk camera to punch. PIN {emp.pinHash ? "is set" : "not set"}.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href={`/print/badges?ids=${emp.id}`} target="_blank">
                  <Printer /> Print badge
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                {emp.userId
                  ? `Signed up as ${emp.user?.email}`
                  : emp.email
                    ? "Invite pending"
                    : "No login (kiosk only)"}
              </p>
              <p className="text-muted-foreground">
                Last seen:{" "}
                {emp.lastSeenAt
                  ? `${formatKey(dateKey(emp.lastSeenAt, tz))} ${formatTime(emp.lastSeenAt, tz)}`
                  : "never"}
              </p>
              <p className="text-muted-foreground">
                Privacy consent: biometrics{" "}
                {emp.biometricConsentAt ? formatKey(dateKey(emp.biometricConsentAt, tz)) : "not given"} ·
                location {emp.locationConsentAt ? formatKey(dateKey(emp.locationConsentAt, tz)) : "not given"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Punches this pay period</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/timesheets/${emp.id}?start=${period.start}`}>Open timesheet</Link>
          </Button>
        </CardHeader>
        <Table>
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>In</TH>
              <TH>Out</TH>
              <TH>Location</TH>
              <TH>Source</TH>
            </tr>
          </THead>
          <TBody>
            {entries.length === 0 ? (
              <TR>
                <TD colSpan={5} className="text-muted-foreground text-center">
                  No punches yet this period.
                </TD>
              </TR>
            ) : (
              entries
                .slice()
                .reverse()
                .map((e) => (
                  <TR key={e.id}>
                    <TD>{formatKey(dateKey(e.clockInAt, tz))}</TD>
                    <TD className="tabular">{formatTime(e.clockInAt, tz)}</TD>
                    <TD className="tabular">
                      {e.clockOutAt ? (
                        formatTime(e.clockOutAt, tz)
                      ) : (
                        <Badge tone="success">On the clock</Badge>
                      )}
                    </TD>
                    <TD>
                      {e.location?.name ?? "—"}{" "}
                      {e.inOutsideGeofence ? <Badge tone="warning">outside</Badge> : null}
                    </TD>
                    <TD className="text-muted-foreground">{e.inSource.toLowerCase()}</TD>
                  </TR>
                ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

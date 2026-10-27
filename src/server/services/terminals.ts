import "server-only";
import type {
  AttendanceDevice,
  Company,
  Location,
  PunchAction,
  PunchSource,
} from "@/generated/prisma/client";
import { effectivePlan, hasFeature } from "@/lib/entitlements";
import { normalizeUserId } from "@/lib/identifiers";
import { parseSettings } from "@/lib/settings";
import { deleteUserCommand, userInfoCommand, type TerminalAction } from "@/lib/terminal/adms";
import { atMinute, tzOffsetMinutes } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { decrypt } from "../crypto";
import { prisma } from "../db";
import { rebuildAttendance } from "./attendance/rebuild";
import { detectOnPunch, raiseRebuildIssues } from "./exceptions";
import { notifyManagers } from "./notifications";

export type Terminal = AttendanceDevice & { company: Company; location: Location | null };

export async function terminalBySerial(serial: string): Promise<Terminal | null> {
  return prisma.attendanceDevice.findUnique({
    where: { serialNumber: serial },
    include: { company: true, location: true },
  });
}

/** Record that a terminal checked in (throttled to one write a minute). */
export async function touchTerminal(
  t: Terminal,
  ip: string | null,
  info: { pushVersion?: string | null; firmware?: string | null } = {},
) {
  const stale = !t.lastSeenAt || Date.now() - t.lastSeenAt.getTime() > 60_000;
  if (!stale && t.lastIp === ip && !info.pushVersion && !info.firmware) return;
  await prisma.attendanceDevice.update({
    where: { id: t.id },
    data: {
      lastSeenAt: new Date(),
      lastIp: ip,
      offlineNotifiedAt: null,
      ...(info.pushVersion ? { pushVersion: info.pushVersion } : {}),
      ...(info.firmware ? { firmware: info.firmware } : {}),
    },
  });
}

/** Unknown serial numbers are remembered (so an admin can see them) but never accepted. */
export async function noteUnclaimed(serial: string, ip: string | null, pushVersion: string | null) {
  await prisma.unclaimedTerminal.upsert({
    where: { serialNumber: serial },
    update: { lastSeenAt: new Date(), lastIp: ip, pushVersion },
    create: { serialNumber: serial, lastIp: ip, pushVersion },
  });
}

export function terminalEnabled(company: Company) {
  return hasFeature(effectivePlan(company), "biometricDevices");
}

/** Terminal-local "YYYY-MM-DD HH:MM:SS" to an instant in the company's time zone. */
export function terminalTime(local: string, timezone: string) {
  const [date, time] = local.split(" ");
  const [h, m, sec] = time!.split(":").map(Number);
  return new Date(atMinute(date!, h! * 60 + m!, timezone).getTime() + (sec ?? 0) * 1000);
}

export function tzOffsetHours(timezone: string) {
  return Math.round(tzOffsetMinutes(new Date(), timezone) / 60);
}

type EmployeeRow = Awaited<ReturnType<typeof loadEmployees>>[number];

async function loadEmployees(companyId: string) {
  return prisma.employee.findMany({
    where: { companyId, status: { not: "ARCHIVED" } },
    include: { locations: { select: { locationId: true } } },
  });
}

/** Terminal user ID → employee: the terminal ID set on the profile, else the employee number. */
export async function employeeLookup(companyId: string) {
  const all = await loadEmployees(companyId);
  const map = new Map<string, EmployeeRow>();
  for (const e of all) if (!e.deviceUserId && e.employeeNo) map.set(normalizeUserId(e.employeeNo), e);
  for (const e of all) if (e.deviceUserId) map.set(normalizeUserId(e.deviceUserId), e);
  return (userId: string) => map.get(normalizeUserId(userId)) ?? null;
}

export type IncomingRecord = {
  userId: string;
  at: Date;
  action: TerminalAction;
  method: string;
  raw?: string;
};

export type IngestResult = {
  received: number;
  ingested: number;
  duplicates: number;
  alreadyImported: number;
  unmatched: Record<string, number>;
};

const COMPATIBLE = (a: string, b: string) => a === b || a === "TOGGLE" || b === "TOGGLE";

/**
 * Add a batch of terminal records (an ADMS upload, an imported file or a bridge push) to the punch
 * log, then re-pair each person's attendance once. Idempotent: a record's ID is derived from the
 * terminal, user ID and time, so re-sent or re-imported logs are no-ops. Records for unknown user
 * IDs are kept as unmatched device logs until someone maps the ID to an employee.
 */
export async function ingestTerminalRecords(
  company: Company,
  device: AttendanceDevice | null,
  records: IncomingRecord[],
  source: Extract<PunchSource, "BIOMETRIC" | "IMPORT" | "API">,
  opts: { dryRun?: boolean } = {},
): Promise<IngestResult> {
  const settings = parseSettings(company.settings);
  const find = await employeeLookup(company.id);
  const result: IngestResult = {
    received: records.length,
    ingested: 0,
    duplicates: 0,
    alreadyImported: 0,
    unmatched: {},
  };
  const byEmployee = new Map<string, { emp: EmployeeRow; recs: (IncomingRecord & { clientId: string })[] }>();
  const prefix =
    source === "BIOMETRIC"
      ? `adms:${device?.serialNumber}`
      : source === "IMPORT"
        ? `import:${device?.serialNumber ?? "file"}`
        : `api:${device?.serialNumber ?? "push"}`;
  for (const r of records) {
    const emp = find(r.userId);
    if (!emp) {
      const id = normalizeUserId(r.userId);
      result.unmatched[id] = (result.unmatched[id] ?? 0) + 1;
      if (!opts.dryRun)
        await prisma.deviceLog
          .create({
            data: {
              companyId: company.id,
              deviceId: device?.id ?? null,
              kind: "ATTLOG",
              userId: id,
              at: r.at,
              raw: r.raw ?? `${r.userId}\t${r.at.toISOString()}\t${r.action}\t${r.method}`,
              status: "UNMATCHED",
            },
          })
          .catch(() => {}); // already stored (unique per terminal, user ID and time)
      continue;
    }
    const clientId = `${prefix}:${normalizeUserId(r.userId)}:${r.at.toISOString()}`;
    const group = byEmployee.get(emp.id) ?? { emp, recs: [] };
    group.recs.push({ ...r, clientId });
    byEmployee.set(emp.id, group);
  }
  const window = settings.duplicatePunchMinutes * 60_000;
  for (const { emp, recs } of byEmployee.values()) {
    recs.sort((a, b) => a.at.getTime() - b.at.getTime());
    const from = recs[0]!.at;
    const to = recs[recs.length - 1]!.at;
    const outcome = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${emp.id}))`;
        const existingIds = new Set(
          (
            await tx.punch.findMany({
              where: { companyId: company.id, clientId: { in: recs.map((r) => r.clientId) } },
              select: { clientId: true },
            })
          ).map((p) => p.clientId),
        );
        const nearby = await tx.punch.findMany({
          where: {
            employeeId: emp.id,
            accepted: true,
            voidedAt: null,
            duplicateOfId: null,
            at: { gte: new Date(from.getTime() - window), lte: new Date(to.getTime() + window) },
          },
          select: { id: true, at: true, action: true },
        });
        const kept = [...nearby];
        let ingested = 0;
        let duplicates = 0;
        let already = 0;
        const otherBranch =
          device?.locationId &&
          !emp.roaming &&
          !emp.locations.some((l) => l.locationId === device.locationId);
        for (const r of recs) {
          if (existingIds.has(r.clientId)) {
            already++;
            continue;
          }
          const dup =
            window > 0
              ? kept
                  .filter((k) => Math.abs(k.at.getTime() - r.at.getTime()) <= window)
                  .sort(
                    (a, b) =>
                      Math.abs(a.at.getTime() - r.at.getTime()) - Math.abs(b.at.getTime() - r.at.getTime()),
                  )[0]
              : undefined;
          const isDup = dup && COMPATIBLE(dup.action, r.action);
          if (opts.dryRun) {
            if (isDup) duplicates++;
            else ingested++;
            if (!isDup) kept.push({ id: r.clientId, at: r.at, action: r.action as PunchAction });
            continue;
          }
          const row = await tx.punch.create({
            data: {
              companyId: company.id,
              employeeId: emp.id,
              clientId: r.clientId,
              action: r.action,
              at: r.at,
              source,
              method: r.method,
              locationId: device?.locationId ?? emp.locations[0]?.locationId ?? null,
              deviceId: device?.id ?? null,
              offline: true,
              accepted: true,
              duplicateOfId: isDup ? dup!.id : null,
              flags: otherBranch ? ["OTHER_BRANCH"] : [],
            },
            select: { id: true, at: true, action: true },
          });
          if (isDup) duplicates++;
          else {
            ingested++;
            kept.push(row);
          }
        }
        if (opts.dryRun || ingested === 0) return { ingested, duplicates, already, rebuilt: null };
        await tx.employee.update({ where: { id: emp.id }, data: { lastSeenAt: new Date() } });
        const rebuilt = await rebuildAttendance(tx, {
          companyId: company.id,
          timezone: company.timezone,
          settings,
          employeeId: emp.id,
          from,
          to,
        });
        return { ingested, duplicates, already, rebuilt };
      },
      { timeout: 60_000 },
    );
    result.ingested += outcome.ingested;
    result.duplicates += outcome.duplicates;
    result.alreadyImported += outcome.already;
    if (outcome.rebuilt) {
      await raiseRebuildIssues(company.id, emp.id, company.timezone, outcome.rebuilt);
      for (const id of outcome.rebuilt.entryIds) await detectOnPunch(company.id, emp.id, id).catch(() => {});
    }
  }
  return result;
}

/** After an unknown terminal ID is mapped to someone, turn its stored records into punches. */
export async function reprocessUnmatched(company: Company) {
  const logs = await prisma.deviceLog.findMany({
    where: { companyId: company.id, kind: "ATTLOG", status: "UNMATCHED" },
    include: { device: true },
    take: 5000,
  });
  const find = await employeeLookup(company.id);
  const ready = logs.filter((l) => l.userId && l.at && find(l.userId));
  const byDevice = new Map<string, typeof ready>();
  for (const l of ready) byDevice.set(l.deviceId ?? "", [...(byDevice.get(l.deviceId ?? "") ?? []), l]);
  let ingested = 0;
  for (const group of byDevice.values()) {
    const device = group[0]!.device;
    const r = await ingestTerminalRecords(
      company,
      device,
      group.map((l) => ({ userId: l.userId!, at: l.at!, action: "TOGGLE" as const, method: "FINGERPRINT" })),
      device ? "BIOMETRIC" : "IMPORT",
    );
    ingested += r.ingested;
  }
  if (ready.length)
    await prisma.deviceLog.updateMany({
      where: { id: { in: ready.map((l) => l.id) } },
      data: { status: "INGESTED" },
    });
  return { ingested, remaining: logs.length - ready.length };
}

// ───────────── Roster sync ─────────────

/** The user ID a person has on terminals. */
export function terminalUserId(e: { deviceUserId: string | null; employeeNo: string | null }) {
  return e.deviceUserId ?? (e.employeeNo ? normalizeUserId(e.employeeNo) : null);
}

/**
 * Queue user updates (name, card) to the terminals each person may use: their branches' terminals,
 * or every terminal for roaming staff. Archived people are removed. Fingerprints stay on the
 * terminals; enrol each finger at the terminals a person uses.
 */
export async function queueRosterSync(companyId: string, employeeIds?: string[]) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company || !terminalEnabled(company)) return 0;
  const devices = await prisma.attendanceDevice.findMany({
    where: { companyId, status: "ACTIVE", vendor: "ZKTECO_ADMS" },
  });
  if (!devices.length) return 0;
  const employees = await prisma.employee.findMany({
    where: { companyId, ...(employeeIds ? { id: { in: employeeIds } } : { status: { not: "ARCHIVED" } }) },
    include: { locations: { select: { locationId: true } } },
  });
  const pending = await prisma.deviceCommand.findMany({
    where: { deviceId: { in: devices.map((d) => d.id) }, status: "PENDING" },
    select: { deviceId: true, command: true },
  });
  const queued = new Set(pending.map((p) => `${p.deviceId}|${p.command}`));
  const data: { deviceId: string; command: string }[] = [];
  for (const d of devices) {
    for (const e of employees) {
      const userId = terminalUserId(e);
      if (!userId) continue;
      const here = !d.locationId || e.roaming || e.locations.some((l) => l.locationId === d.locationId);
      const command =
        e.status === "ARCHIVED" || !here
          ? deleteUserCommand(userId)
          : userInfoCommand({ userId, name: fullName(e), card: decrypt(e.cardEnc) });
      // Only remove from terminals when the person left or moved, not when they were never there.
      if (!here && e.status !== "ARCHIVED" && !employeeIds) continue;
      if (!queued.has(`${d.id}|${command}`)) data.push({ deviceId: d.id, command });
    }
  }
  if (data.length) await prisma.deviceCommand.createMany({ data });
  return data.length;
}

/** Commands for a terminal's poll, marked sent. */
export async function takeCommands(deviceId: string, limit = 25) {
  const cmds = await prisma.deviceCommand.findMany({
    where: {
      deviceId,
      OR: [{ status: "PENDING" }, { status: "SENT", sentAt: { lt: new Date(Date.now() - 10 * 60_000) } }],
    },
    orderBy: { id: "asc" },
    take: limit,
  });
  if (cmds.length)
    await prisma.deviceCommand.updateMany({
      where: { id: { in: cmds.map((c) => c.id) } },
      data: { status: "SENT", sentAt: new Date() },
    });
  return cmds;
}

export async function recordCommandResults(deviceId: string, results: { id: number; returnCode: number }[]) {
  for (const r of results)
    await prisma.deviceCommand.updateMany({
      where: { id: r.id, deviceId },
      data: { status: r.returnCode === 0 ? "DONE" : "FAILED", returnCode: r.returnCode, doneAt: new Date() },
    });
}

// ───────────── Health ─────────────

const OFFLINE_AFTER_MS = 30 * 60_000;

/** Alert admins and HR once when a terminal stops checking in. */
export async function checkTerminals(now = new Date()) {
  const silent = await prisma.attendanceDevice.findMany({
    where: {
      status: "ACTIVE",
      lastSeenAt: { lt: new Date(now.getTime() - OFFLINE_AFTER_MS) },
      offlineNotifiedAt: null,
    },
    include: { company: true, location: true },
  });
  for (const d of silent) {
    if (!terminalEnabled(d.company)) continue;
    await notifyManagers(
      d.companyId,
      null,
      {
        kind: "terminal.offline",
        title: `Terminal offline: ${d.name}`,
        body: `${d.location?.name ?? "No branch"} · last seen ${d.lastSeenAt!.toISOString().slice(0, 16).replace("T", " ")} UTC. Punches are kept on the terminal and upload when it reconnects.`,
        url: "/app/settings/devices",
        email: true,
      },
      ["OWNER", "ADMIN", "HR"],
    );
    await prisma.attendanceDevice.update({ where: { id: d.id }, data: { offlineNotifiedAt: now } });
  }
  return silent.length;
}

export function isOnline(d: Pick<AttendanceDevice, "lastSeenAt">, now = Date.now()) {
  return !!d.lastSeenAt && now - d.lastSeenAt.getTime() < OFFLINE_AFTER_MS;
}

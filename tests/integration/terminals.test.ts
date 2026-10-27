import { afterAll, describe, expect, it } from "vitest";
import { GET as handshake, POST as upload } from "@/app/iclock/cdata/route";
import { POST as commandResults } from "@/app/iclock/devicecmd/route";
import { GET as poll } from "@/app/iclock/getrequest/route";
import { dateKey } from "@/lib/time";
import { prisma } from "@/server/db";
import { addEmployee } from "@/server/services/team";
import {
  ingestTerminalRecords,
  queueRosterSync,
  reprocessUnmatched,
  terminalTime,
} from "@/server/services/terminals";
import { cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(async () => {
  await cleanup(created);
  await prisma.unclaimedTerminal.deleteMany({ where: { serialNumber: { startsWith: "TESTSN" } } });
});

const TZ = "Asia/Manila";
const base = "http://localhost/iclock";

async function setup() {
  const t = await makeCompany({ plan: "ENTERPRISE" });
  created.push(t.company.id);
  const serial = `TESTSN${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
  const device = await prisma.attendanceDevice.create({
    data: { companyId: t.company.id, name: "Gate", serialNumber: serial, locationId: t.location!.id },
  });
  const emp = await addEmployee(t.ctx, {
    firstName: "Gina",
    rate: 600,
    deviceUserId: "42",
    cardNumber: "4100137",
    locationIds: [t.location!.id],
  });
  return { ...t, serial, device, emp };
}

// A recent working-day morning, as terminal-local text.
const day = dateKey(new Date(Date.now() - 2 * 86_400_000), TZ);

describe("ZKTeco ADMS terminals", () => {
  it("refuses unknown serial numbers and remembers them", async () => {
    const sn = `TESTSNX${Date.now()}`;
    const res = await handshake(new Request(`${base}/cdata?SN=${sn}&options=all`));
    expect(res.status).toBe(403);
    expect(await prisma.unclaimedTerminal.findUnique({ where: { serialNumber: sn } })).toBeTruthy();
  });

  it("handshakes, ingests ATTLOG once even when re-sent, and keeps unknown IDs", async () => {
    const t = await setup();
    const hs = await handshake(new Request(`${base}/cdata?SN=${t.serial}&options=all&pushver=2.4.1`));
    expect(await hs.text()).toContain(`GET OPTION FROM: ${t.serial}`);
    const body = `42\t${day} 07:55:00\t0\t1\t0\t0\n42\t${day} 17:03:00\t0\t4\t0\t0\n999\t${day} 08:01:00\t0\t1\t0\t0\n`;
    const send = () =>
      upload(new Request(`${base}/cdata?SN=${t.serial}&table=ATTLOG&Stamp=100`, { method: "POST", body }));
    expect(await (await send()).text()).toBe("OK: 3");
    await send(); // terminals retry uploads
    const entries = await prisma.timeEntry.findMany({ where: { employeeId: t.emp.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.clockInAt).toEqual(terminalTime(`${day} 07:55:00`, TZ));
    expect(entries[0]!.clockOutAt).toEqual(terminalTime(`${day} 17:03:00`, TZ));
    const methods = await prisma.punch.findMany({
      where: { employeeId: t.emp.id },
      select: { method: true, source: true },
    });
    expect(methods.map((m) => m.method).sort()).toEqual(["CARD", "FINGERPRINT"]);
    expect(methods.every((m) => m.source === "BIOMETRIC")).toBe(true);
    expect(
      (await prisma.attendanceDevice.findUniqueOrThrow({ where: { id: t.device.id } })).attlogStamp,
    ).toBe("100");
    const unmatched = await prisma.deviceLog.findMany({
      where: { deviceId: t.device.id, status: "UNMATCHED" },
    });
    expect(unmatched.map((u) => u.userId)).toEqual(["999"]);
  });

  it("maps an unknown ID later and turns its stored punches into a duty", async () => {
    const t = await setup();
    const other = await addEmployee(t.ctx, { firstName: "Noel", rate: 600, locationIds: [t.location!.id] });
    await upload(
      new Request(`${base}/cdata?SN=${t.serial}&table=ATTLOG`, {
        method: "POST",
        body: `77\t${day} 08:00:00\t0\t1\n77\t${day} 17:00:00\t0\t1\n`,
      }),
    );
    expect(await prisma.timeEntry.count({ where: { employeeId: other.id } })).toBe(0);
    await prisma.employee.update({ where: { id: other.id }, data: { deviceUserId: "77" } });
    const r = await reprocessUnmatched(t.company);
    expect(r.ingested).toBe(2);
    expect(await prisma.timeEntry.count({ where: { employeeId: other.id } })).toBe(1);
  });

  it("queues the roster for the terminal and records command results", async () => {
    const t = await setup();
    await queueRosterSync(t.company.id);
    const res = await poll(new Request(`${base}/getrequest?SN=${t.serial}`));
    const lines = (await res.text()).split("\n");
    const mine = lines.find((l) => l.includes("PIN=42"));
    expect(mine).toMatch(/^C:\d+:DATA UPDATE USERINFO PIN=42\tName=Gina\t.*Card=4100137/);
    const id = Number(mine!.split(":")[1]);
    await commandResults(
      new Request(`${base}/devicecmd?SN=${t.serial}`, {
        method: "POST",
        body: `ID=${id}&Return=0&CMD=DATA\n`,
      }),
    );
    expect((await prisma.deviceCommand.findUniqueOrThrow({ where: { id } })).status).toBe("DONE");
    expect(await (await poll(new Request(`${base}/getrequest?SN=${t.serial}`))).text()).toBe("OK");
  });

  it("previews and imports a log file without duplicating an earlier upload", async () => {
    const t = await setup();
    const recs = [
      {
        userId: "42",
        at: terminalTime(`${day} 08:10:00`, TZ),
        action: "TOGGLE" as const,
        method: "FINGERPRINT",
      },
      {
        userId: "42",
        at: terminalTime(`${day} 17:20:00`, TZ),
        action: "TOGGLE" as const,
        method: "FINGERPRINT",
      },
    ];
    const preview = await ingestTerminalRecords(t.company, t.device, recs, "IMPORT", { dryRun: true });
    expect(preview.ingested).toBe(2);
    expect(await prisma.punch.count({ where: { employeeId: t.emp.id } })).toBe(0);
    await ingestTerminalRecords(t.company, t.device, recs, "IMPORT");
    const again = await ingestTerminalRecords(t.company, t.device, recs, "IMPORT");
    expect(again.alreadyImported).toBe(2);
    expect(await prisma.timeEntry.count({ where: { employeeId: t.emp.id } })).toBe(1);
  });

  it("refuses disabled terminals", async () => {
    const t = await setup();
    await prisma.attendanceDevice.update({ where: { id: t.device.id }, data: { status: "DISABLED" } });
    expect((await handshake(new Request(`${base}/cdata?SN=${t.serial}`))).status).toBe(403);
  });
});

describe("kiosk RFID cards", () => {
  it("identifies a person by card on Enterprise, however the reader formats the number", async () => {
    const { identify } = await import("@/server/kiosk");
    const t = await setup();
    const kiosk = {
      device: { id: `kiosk-${t.serial}` },
      company: t.company,
      plan: "ENTERPRISE",
    } as unknown as Parameters<typeof identify>[0];
    expect((await identify(kiosk, { card: "0004100137" })).id).toBe(t.emp.id);
    await expect(identify(kiosk, { card: "9999999" })).rejects.toThrow(/Card not recognized/);
    await expect(identify({ ...kiosk, plan: "PRO" } as typeof kiosk, { card: "4100137" })).rejects.toThrow(
      /Enterprise/,
    );
  });
});

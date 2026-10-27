import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addEmployee } from "@/server/services/team";
import { punch, type PunchActor } from "@/server/services/timeclock";
import { cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));

const MANILA = { lat: 14.5547, lng: 121.0244 };
const CEBU = { lat: 10.3157, lng: 123.8854 };
const ago = (m: number) => new Date(Math.floor(Date.now() / 60_000) * 60_000 - m * 60_000);

async function setup(fieldWork = true) {
  const t = await makeCompany({
    plan: "ENTERPRISE",
    location: { latitude: MANILA.lat, longitude: MANILA.lng },
  });
  created.push(t.company.id);
  await prisma.location.update({ where: { id: t.location!.id }, data: { geofenceMode: "BLOCK" } });
  const driver = await addEmployee(t.ctx, { firstName: "Dan", rate: 700, fieldWork });
  const actor = (employee = driver): PunchActor => ({
    companyId: t.company.id,
    timezone: "Asia/Manila",
    plan: "ENTERPRISE",
    settings: { ...t.ctx.settings, fieldRequireSelfie: false },
    employee,
  });
  return { ...t, driver, actor };
}

describe("field mode", () => {
  it("lets drivers punch away from branches but insists on a good GPS fix", async () => {
    const t = await setup();
    await expect(punch(t.actor(), { action: "CLOCK_IN", source: "MOBILE" })).rejects.toThrow(/GPS stamp/);
    await expect(
      punch(t.actor(), { action: "CLOCK_IN", source: "MOBILE", ...CEBU, accuracy: 350 }),
    ).rejects.toThrow(/accurate to 350 m/);
    // 570 km from the only branch, whose geofence would block anyone else.
    await expect(
      punch(t.actor(), { action: "CLOCK_IN", source: "MOBILE", ...CEBU, accuracy: 20 }),
    ).resolves.toBeTruthy();
  });

  it("asks field staff for a selfie when required", async () => {
    const t = await setup();
    const strict = { ...t.actor(), settings: { ...t.ctx.settings, fieldRequireSelfie: true } };
    await expect(
      punch(strict, { action: "CLOCK_IN", source: "MOBILE", ...CEBU, accuracy: 20 }),
    ).rejects.toThrow(/selfie/);
  });

  it("flags impossible travel and a shared phone for review", async () => {
    const t = await setup();
    const other = await addEmployee(t.ctx, { firstName: "Oli", rate: 700, fieldWork: true });
    await punch(t.actor(), {
      action: "CLOCK_IN",
      source: "MOBILE",
      offline: true,
      at: ago(40),
      ...MANILA,
      accuracy: 15,
      clientKey: "phone-1",
    });
    const out = await punch(t.actor(), {
      action: "CLOCK_OUT",
      source: "MOBILE",
      offline: true,
      at: ago(10),
      ...CEBU,
      accuracy: 15,
      clientKey: "phone-1",
    });
    await punch(t.actor(other), {
      action: "CLOCK_IN",
      source: "MOBILE",
      ...MANILA,
      accuracy: 15,
      clientKey: "phone-1",
    });
    const flags = await prisma.punch.findMany({ where: { clientKey: "phone-1", companyId: t.company.id } });
    expect(flags.find((p) => p.employeeId === t.driver.id && p.action === "CLOCK_OUT")!.flags).toContain(
      "IMPOSSIBLE_TRAVEL",
    );
    expect(flags.find((p) => p.employeeId === other.id)!.flags).toContain("SHARED_DEVICE");
    const x = await prisma.timeException.findMany({
      where: { companyId: t.company.id, type: "PROXY_SUSPECT" },
    });
    expect(x.map((e) => e.employeeId).sort()).toEqual([t.driver.id, other.id].sort());
    expect(x.find((e) => e.employeeId === t.driver.id)!.timeEntryId).toBe(out.entryId);
  });

  it("flags an offline punch whose time runs backwards", async () => {
    const t = await setup(false);
    const base = { source: "MOBILE" as const, offline: true, clientKey: "phone-2", ...MANILA, accuracy: 10 };
    await punch(t.actor(), { ...base, action: "CLOCK_IN", at: ago(120), seq: 5 });
    // Punch #6 claims to be earlier than punch #5: the phone clock was turned back.
    await punch(t.actor(), { ...base, action: "CLOCK_OUT", at: ago(150), seq: 6 });
    const x = await prisma.timeException.findFirst({
      where: { companyId: t.company.id, type: "OFFLINE_TIME_SUSPECT" },
    });
    expect((x!.details as { flags: string[] }).flags).toEqual(["TIME_ORDER"]);
  });
});

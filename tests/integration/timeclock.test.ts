import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addEmployee } from "@/server/services/team";
import { getClockState, punch, type PunchActor } from "@/server/services/timeclock";
import { cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));

const SITE = { latitude: 14.6417, longitude: 121.0577 };

async function setup(plan: "FREE" | "STARTER" | "PRO" = "PRO") {
  const t = await makeCompany({ plan, location: SITE });
  created.push(t.company.id);
  const emp = await addEmployee(t.ctx, { firstName: "Ana", lastName: "Cruz", payType: "DAILY", rate: 700 });
  const actor: PunchActor = {
    companyId: t.company.id,
    timezone: "Asia/Manila",
    plan,
    settings: t.ctx.settings,
    employee: emp,
  };
  return { ...t, emp, actor };
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60000);

describe("time clock", () => {
  it("clocks in, takes a break and clocks out", async () => {
    const { actor } = await setup();
    await punch(actor, {
      action: "CLOCK_IN",
      source: "MOBILE",
      at: minutesAgo(300),
      lat: SITE.latitude,
      lng: SITE.longitude,
    });
    expect((await getClockState(actor)).status).toBe("in");
    await punch(actor, { action: "BREAK_START", source: "MOBILE", at: minutesAgo(200) });
    expect((await getClockState(actor)).status).toBe("break");
    await punch(actor, { action: "BREAK_END", source: "MOBILE", at: minutesAgo(140) });
    const out = await punch(actor, { action: "CLOCK_OUT", source: "MOBILE", at: minutesAgo(0) });
    const entry = await prisma.timeEntry.findUniqueOrThrow({
      where: { id: out.entryId },
      include: { breaks: true },
    });
    expect(entry.status).toBe("CLOSED");
    expect(entry.breaks).toHaveLength(1);
    expect((await getClockState(actor)).status).toBe("out");
  });

  it("rejects double clock-in and clock-out without clock-in", async () => {
    const { actor } = await setup();
    await expect(punch(actor, { action: "CLOCK_OUT", source: "MOBILE" })).rejects.toThrow(/not clocked in/);
    await punch(actor, { action: "CLOCK_IN", source: "MOBILE", lat: SITE.latitude, lng: SITE.longitude });
    await expect(punch(actor, { action: "CLOCK_IN", source: "MOBILE" })).rejects.toThrow(
      /already clocked in/,
    );
  });

  it("is idempotent for replayed offline punches", async () => {
    const { actor } = await setup();
    const clientId = randomUUID();
    const a = await punch(actor, { action: "CLOCK_IN", source: "MOBILE", clientId, at: minutesAgo(30) });
    const b = await punch(actor, { action: "CLOCK_IN", source: "MOBILE", clientId, at: minutesAgo(30) });
    expect(b.entryId).toBe(a.entryId);
    expect(await prisma.timeEntry.count({ where: { employeeId: actor.employee.id } })).toBe(1);
  });

  it("creates one entry when the same offline punch is replayed concurrently", async () => {
    const { actor } = await setup();
    const clientId = randomUUID();
    const at = minutesAgo(10);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => punch(actor, { action: "CLOCK_IN", source: "MOBILE", clientId, at })),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await prisma.timeEntry.count({ where: { employeeId: actor.employee.id } })).toBe(1);
    // Different punches racing: only one clock-in can win.
    const out = await Promise.allSettled(
      [1, 2, 3].map(() => punch(actor, { action: "CLOCK_OUT", source: "MOBILE" })),
    );
    expect(out.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("blocks clock-ins outside a BLOCK geofence and logs the rejection", async () => {
    const { actor, location } = await setup();
    await prisma.location.update({
      where: { id: location.id },
      data: { geofenceMode: "BLOCK", radiusMeters: 100 },
    });
    await expect(
      punch(actor, {
        action: "CLOCK_IN",
        source: "MOBILE",
        lat: SITE.latitude + 0.01,
        lng: SITE.longitude,
        accuracy: 10,
      }),
    ).rejects.toThrow(/Move within 100 m/);
    await expect(punch(actor, { action: "CLOCK_IN", source: "MOBILE" })).rejects.toThrow(/location services/);
    const log = await prisma.punch.findMany({ where: { employeeId: actor.employee.id } });
    expect(log.every((p) => !p.accepted)).toBe(true);
    const ok = await punch(actor, {
      action: "CLOCK_IN",
      source: "MOBILE",
      lat: SITE.latitude,
      lng: SITE.longitude,
      accuracy: 10,
    });
    expect(ok.locationName).toBe("HQ");
  });

  it("only warns outside a WARN geofence and flags the entry", async () => {
    const { actor, location } = await setup();
    await prisma.location.update({ where: { id: location.id }, data: { geofenceMode: "WARN" } });
    const r = await punch(actor, {
      action: "CLOCK_IN",
      source: "MOBILE",
      lat: SITE.latitude + 0.01,
      lng: SITE.longitude,
    });
    expect(r.warning).toMatch(/outside HQ/);
    const entry = await prisma.timeEntry.findUniqueOrThrow({ where: { id: r.entryId } });
    expect(entry.inOutsideGeofence).toBe(true);
  });

  it("ignores geofences on the Free plan", async () => {
    const { actor, location } = await setup("FREE");
    await prisma.location.update({ where: { id: location.id }, data: { geofenceMode: "BLOCK" } });
    await expect(
      punch(actor, { action: "CLOCK_IN", source: "MOBILE", lat: 10, lng: 120 }),
    ).resolves.toBeTruthy();
  });

  it("rejects punches from the future or too far in the past", async () => {
    const { actor } = await setup();
    await expect(
      punch(actor, { action: "CLOCK_IN", source: "MOBILE", at: new Date(Date.now() + 3600_000) }),
    ).rejects.toThrow(/future/);
    await expect(
      punch(actor, { action: "CLOCK_IN", source: "MOBILE", at: minutesAgo(5 * 24 * 60) }),
    ).rejects.toThrow(/3 days/);
  });
});

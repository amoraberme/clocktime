import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { rebuildForSchedule } from "@/server/services/attendance/relink";
import { addEmployee } from "@/server/services/team";
import { punch, type PunchActor } from "@/server/services/timeclock";
import { cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));

const HOUR = 3600_000;
const ago = (h: number) => new Date(Math.floor(Date.now() / 60_000) * 60_000 - h * HOUR);

async function setup() {
  const t = await makeCompany({ plan: "ENTERPRISE" });
  created.push(t.company.id);
  const emp = await addEmployee(t.ctx, { firstName: "Guard", lastName: "Reyes", rate: 700 });
  const actor: PunchActor = {
    companyId: t.company.id,
    timezone: "Asia/Manila",
    plan: "ENTERPRISE",
    settings: t.ctx.settings,
    employee: emp,
  };
  const tap = (at: Date, source: "BIOMETRIC" | "IMPORT" = "BIOMETRIC") =>
    punch(actor, { action: "TOGGLE", source, method: "FINGERPRINT", offline: true, at });
  const shift = (startAt: Date, endAt: Date) =>
    prisma.shift.create({
      data: {
        companyId: t.company.id,
        employeeId: emp.id,
        locationId: t.location!.id,
        startAt,
        endAt,
        status: "PUBLISHED",
      },
    });
  const entries = () =>
    prisma.timeEntry.findMany({ where: { employeeId: emp.id }, orderBy: { clockInAt: "asc" } });
  const exceptions = () => prisma.timeException.findMany({ where: { employeeId: emp.id } });
  return { ...t, emp, actor, tap, shift, entries, exceptions };
}

describe("attendance engine", () => {
  it("pairs fingerprint taps against the schedule", async () => {
    const t = await setup();
    const s = await t.shift(ago(30), ago(21));
    await t.tap(ago(30.1));
    await t.tap(ago(26));
    await t.tap(ago(25));
    await t.tap(ago(20.9));
    const [e, ...rest] = await t.entries();
    expect(rest).toHaveLength(0);
    expect(e!.shiftId).toBe(s.id);
    expect(e!.clockOutAt).toEqual(ago(20.9));
    expect(await prisma.break.count({ where: { timeEntryId: e!.id } })).toBe(1);
  });

  it("counts a fingerprint and a phone punch moments apart once", async () => {
    const t = await setup();
    await t.tap(ago(5));
    const phone = await punch(t.actor, {
      action: "CLOCK_IN",
      source: "MOBILE",
      offline: true,
      at: new Date(ago(5).getTime() + 2 * 60_000),
    });
    expect(phone.duplicate).toBe(true);
    expect(await t.entries()).toHaveLength(1);
  });

  it("re-pairs offline punches that arrive out of order", async () => {
    const t = await setup();
    await punch(t.actor, { action: "CLOCK_OUT", source: "MOBILE", offline: true, at: ago(2) });
    expect(await t.entries()).toHaveLength(0);
    expect((await t.exceptions()).map((x) => x.type)).toContain("MISSING_CLOCK_IN");
    await punch(t.actor, { action: "CLOCK_IN", source: "MOBILE", offline: true, at: ago(10) });
    const all = await t.entries();
    expect(all).toHaveLength(1);
    expect(all[0]!.clockOutAt).toEqual(ago(2));
  });

  it("keeps a 24-hour duty whole and sends an overstay to review", async () => {
    const t = await setup();
    await t.shift(ago(56), ago(32));
    await t.tap(ago(56.2));
    await t.tap(ago(26));
    const [e] = await t.entries();
    expect(e!.clockOutAt).toEqual(ago(26));
    expect(e!.flags).toContain("LONG_DUTY");
    expect((await t.exceptions()).map((x) => x.type)).toContain("LONG_DUTY");
  });

  it("flags a missing clock-out when the next duty starts", async () => {
    const t = await setup();
    await punch(t.actor, { action: "CLOCK_IN", source: "MOBILE", offline: true, at: ago(60) });
    await punch(t.actor, { action: "CLOCK_IN", source: "MOBILE", offline: true, at: ago(9) });
    await punch(t.actor, { action: "CLOCK_OUT", source: "MOBILE", offline: true, at: ago(1) });
    const all = await t.entries();
    expect(all).toHaveLength(2);
    expect(all[0]!.clockOutAt).toBeNull();
    expect(all[0]!.flags).toContain("MISSING_OUT");
    expect(all[1]!.clockOutAt).toEqual(ago(1));
    expect((await t.exceptions()).map((x) => x.type)).toContain("MISSED_CLOCK_OUT");
  });

  it("keeps terminal punches in a finalized period out of payroll and flags them", async () => {
    const t = await setup();
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    await prisma.payRun.create({
      data: {
        companyId: t.company.id,
        periodStart: new Date(today.getTime() - 10 * 86_400_000),
        periodEnd: new Date(today.getTime() + 86_400_000),
        payDate: today,
        status: "FINALIZED",
      },
    });
    const r = await t.tap(ago(3));
    expect(r.entryId).toBeNull();
    expect(await t.entries()).toHaveLength(0);
    expect((await t.exceptions()).map((x) => x.type)).toContain("LOCKED_PERIOD_PUNCH");
  });

  it("re-links attendance when the schedule changes", async () => {
    const t = await setup();
    await t.tap(ago(12));
    await t.tap(ago(4));
    expect((await t.entries())[0]!.shiftId).toBeNull();
    const s = await t.shift(ago(12), ago(4));
    await rebuildForSchedule({ id: t.company.id, timezone: "Asia/Manila", settings: t.ctx.settings }, [
      { employeeId: t.emp.id, from: s.startAt, to: s.endAt },
    ]);
    const [e] = await t.entries();
    expect(e!.shiftId).toBe(s.id);
    expect(e!.flags).not.toContain("UNSCHEDULED");
  });

  it("leaves hand-edited entries alone", async () => {
    const t = await setup();
    await t.tap(ago(12));
    await t.tap(ago(4));
    const [e] = await t.entries();
    await prisma.timeEntry.update({
      where: { id: e!.id },
      data: { manualOverride: true, clockOutAt: ago(5) },
    });
    await t.tap(ago(8));
    const after = await t.entries();
    expect(after).toHaveLength(1);
    expect(after[0]!.clockOutAt).toEqual(ago(5));
  });

  it("adopts entries made before pairing so they can still be clocked out", async () => {
    const t = await setup();
    const legacy = await prisma.timeEntry.create({
      data: { companyId: t.company.id, employeeId: t.emp.id, clockInAt: ago(3), inSource: "KIOSK" },
    });
    const r = await punch(t.actor, { action: "CLOCK_OUT", source: "MOBILE" });
    expect(r.entryId).toBe(legacy.id);
    const [e] = await t.entries();
    expect(e!.clockOutAt).not.toBeNull();
    expect(e!.inPunchId).toBeTruthy();
  });
});

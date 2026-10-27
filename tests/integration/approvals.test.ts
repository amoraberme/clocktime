import { afterAll, describe, expect, it } from "vitest";
import { atMinute, dateKey, toLocalDateTimeInput } from "@/lib/time";
import { prisma } from "@/server/db";
import type { AppContext } from "@/server/context";
import { approvalInbox } from "@/server/queries/approvals";
import { decideLeave } from "@/server/services/leave";
import {
  decideCorrection,
  decideScheduleChange,
  requestCorrection,
  requestScheduleChange,
} from "@/server/services/requests";
import { addEmployee } from "@/server/services/team";
import { punch, type PunchActor } from "@/server/services/timeclock";
import { asMember, cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));

const TZ = "Asia/Manila";
const HOUR = 3600_000;
const ago = (h: number) => new Date(Math.floor(Date.now() / 60_000) * 60_000 - h * HOUR);

async function setup(levels: 1 | 2 = 2) {
  const t = await makeCompany({ plan: "ENTERPRISE" });
  created.push(t.company.id);
  const settings = {
    ...t.ctx.settings,
    approvalLevelsLeave: levels,
    approvalLevelsCorrection: levels,
    approvalLevelsSchedule: levels,
  };
  const base = { ...t.ctx, settings } as AppContext;
  const emp = await addEmployee(base, { firstName: "Ella", rate: 700, locationIds: [t.location!.id] });
  const sup = await addEmployee(base, {
    firstName: "Sid",
    role: "MANAGER",
    rate: 800,
    locationIds: [t.location!.id],
  });
  const hr = await addEmployee(base, { firstName: "Hana", role: "HR", rate: 900 });
  const tk = await addEmployee(base, { firstName: "Tim", role: "TIMEKEEPER", rate: 700 });
  const as = {
    employee: asMember(base, emp, "EMPLOYEE"),
    supervisor: asMember(base, sup, "MANAGER", { locationIds: [t.location!.id] }),
    hr: asMember(base, hr, "HR"),
    timekeeper: asMember(base, tk, "TIMEKEEPER"),
  };
  const actor: PunchActor = {
    companyId: t.company.id,
    timezone: TZ,
    plan: "ENTERPRISE",
    settings,
    employee: emp,
  };
  return { ...t, emp, as, actor };
}

describe("requests and approvals", () => {
  it("two-level leave: the supervisor endorses, HR gives the final approval", async () => {
    const t = await setup(2);
    const vl = await prisma.leaveType.findFirstOrThrow({ where: { companyId: t.company.id, code: "VL" } });
    const req = await prisma.leaveRequest.create({
      data: {
        companyId: t.company.id,
        employeeId: t.emp.id,
        leaveTypeId: vl.id,
        startDate: new Date("2026-12-02T00:00:00Z"),
        endDate: new Date("2026-12-02T00:00:00Z"),
        days: 1,
      },
    });
    await decideLeave(t.as.supervisor, req.id, true);
    let row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(row.status).toBe("PENDING");
    expect(row.currentLevel).toBe(2);
    await expect(decideLeave(t.as.supervisor, req.id, true)).rejects.toThrow(/waiting for HR/);
    const inbox = await approvalInbox(t.as.supervisor);
    expect(inbox.find((i) => i.id === req.id)?.canDecide).toBe(false);
    await decideLeave(t.as.hr, req.id, true);
    row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(row.status).toBe("APPROVED");
    expect(await prisma.approvalStep.count({ where: { requestId: req.id } })).toBe(2);
  });

  it("a missing clock-out correction closes the duty once approved", async () => {
    const t = await setup(1);
    await punch(t.actor, { action: "CLOCK_IN", source: "MOBILE", offline: true, at: ago(30) });
    await punch(t.actor, { action: "CLOCK_IN", source: "MOBILE", offline: true, at: ago(5) });
    const [stale] = await prisma.timeEntry.findMany({
      where: { employeeId: t.emp.id },
      orderBy: { clockInAt: "asc" },
    });
    expect(stale!.flags).toContain("MISSING_OUT");
    const req = await requestCorrection(t.as.employee, {
      kind: "MISSING_OUT",
      timeEntryId: stale!.id,
      clockOut: toLocalDateTimeInput(ago(21), TZ),
      reason: "Terminal was down when I left",
    });
    // Timekeepers handle attendance corrections.
    await decideCorrection(t.as.timekeeper, req.id, true);
    const entries = await prisma.timeEntry.findMany({
      where: { employeeId: t.emp.id },
      orderBy: { clockInAt: "asc" },
    });
    expect(entries[0]!.clockOutAt).toEqual(ago(21));
    expect(entries[0]!.flags).not.toContain("MISSING_OUT");
    expect(entries[0]!.outSource).toBe("CORRECTION");
    const open = await prisma.timeException.count({
      where: { employeeId: t.emp.id, type: "MISSED_CLOCK_OUT", status: "OPEN" },
    });
    expect(open).toBe(0);
  });

  it("a wrong-time correction voids the old punch and re-pairs the duty", async () => {
    const t = await setup(1);
    const tap = (at: Date) =>
      punch(t.actor, { action: "TOGGLE", source: "BIOMETRIC", method: "FINGERPRINT", offline: true, at });
    await tap(ago(10));
    await tap(ago(2));
    const [entry] = await prisma.timeEntry.findMany({ where: { employeeId: t.emp.id } });
    const req = await requestCorrection(t.as.employee, {
      kind: "WRONG_TIME",
      timeEntryId: entry!.id,
      clockIn: toLocalDateTimeInput(ago(11), TZ),
      reason: "I tapped late because of a queue",
    });
    await decideCorrection(t.as.hr, req.id, true);
    const [fixed, ...rest] = await prisma.timeEntry.findMany({ where: { employeeId: t.emp.id } });
    expect(rest).toHaveLength(0);
    expect(fixed!.clockInAt).toEqual(ago(11));
    expect(fixed!.clockOutAt).toEqual(ago(2));
    expect(await prisma.punch.count({ where: { employeeId: t.emp.id, voidedAt: { not: null } } })).toBe(1);
  });

  it("an approved schedule change moves the shift", async () => {
    const t = await setup(1);
    const day = dateKey(new Date(Date.now() + 3 * 86_400_000), TZ);
    const shift = await prisma.shift.create({
      data: {
        companyId: t.company.id,
        employeeId: t.emp.id,
        locationId: t.location!.id,
        startAt: atMinute(day, 8 * 60, TZ),
        endAt: atMinute(day, 17 * 60, TZ),
        status: "PUBLISHED",
      },
    });
    const req = await requestScheduleChange(t.as.employee, {
      kind: "CHANGE",
      shiftId: shift.id,
      date: day,
      start: "22:00",
      end: "06:00",
      reason: "Covering the night shift",
    });
    await expect(decideScheduleChange(t.as.employee, req.id, true)).rejects.toThrow();
    await decideScheduleChange(t.as.supervisor, req.id, true);
    const moved = await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } });
    expect(moved.startAt).toEqual(atMinute(day, 22 * 60, TZ));
    expect(moved.endAt).toEqual(atMinute(day, 30 * 60, TZ));
  });
});

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { detectOnPunch, detectScheduled } from "@/server/services/exceptions";
import { decideLeave, leaveBalances, requestLeave, silEligible } from "@/server/services/leave";
import { addEmployee } from "@/server/services/team";
import { punch } from "@/server/services/timeclock";
import { addDays, atMinute, dateKey } from "@/lib/time";
import { cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));
const TZ = "Asia/Manila";

describe("exception detection", () => {
  it("flags late arrival, long break and unapproved overtime on clock-out", async () => {
    const t = await makeCompany({ plan: "PRO" });
    created.push(t.company.id);
    const emp = await addEmployee(t.ctx, {
      firstName: "Lia",
      lastName: "L",
      payType: "DAILY",
      rate: 700,
      restDays: [],
    });
    const today = dateKey(new Date(Date.now() - 24 * 3600_000), TZ);
    const shift = await prisma.shift.create({
      data: {
        companyId: t.company.id,
        locationId: t.location.id,
        employeeId: emp.id,
        startAt: atMinute(today, 8 * 60, TZ),
        endAt: atMinute(today, 17 * 60, TZ),
        status: "PUBLISHED",
      },
    });
    const actor = {
      companyId: t.company.id,
      timezone: TZ,
      plan: "PRO" as const,
      settings: t.ctx.settings,
      employee: emp,
    };
    const r = await punch(actor, {
      action: "CLOCK_IN",
      source: "MOBILE",
      offline: true,
      at: atMinute(today, 8 * 60 + 20, TZ),
    });
    expect((await prisma.timeEntry.findUnique({ where: { id: r.entryId! } }))?.shiftId).toBe(shift.id);
    await punch(actor, {
      action: "BREAK_START",
      source: "MOBILE",
      offline: true,
      at: atMinute(today, 12 * 60, TZ),
    });
    await punch(actor, {
      action: "BREAK_END",
      source: "MOBILE",
      offline: true,
      at: atMinute(today, 13 * 60 + 30, TZ),
    });
    await punch(actor, {
      action: "CLOCK_OUT",
      source: "MOBILE",
      offline: true,
      at: atMinute(today, 20 * 60, TZ),
    });
    await detectOnPunch(t.company.id, emp.id, r.entryId!);
    await detectOnPunch(t.company.id, emp.id, r.entryId!); // idempotent
    const types = (await prisma.timeException.findMany({ where: { employeeId: emp.id } }))
      .map((x) => x.type)
      .sort();
    expect(types).toEqual(["LATE_ARRIVAL", "LONG_BREAK", "UNAPPROVED_OVERTIME"]);
  });

  it("raises no-shows and missed clock-outs from the scheduled job", async () => {
    const t = await makeCompany({ plan: "STARTER" });
    created.push(t.company.id);
    const emp = await addEmployee(t.ctx, { firstName: "Noel", lastName: "N", payType: "DAILY", rate: 700 });
    const now = Date.now();
    await prisma.shift.create({
      data: {
        companyId: t.company.id,
        locationId: t.location.id,
        employeeId: emp.id,
        startAt: new Date(now - 10 * 3600_000),
        endAt: new Date(now - 2 * 3600_000),
        status: "PUBLISHED",
      },
    });
    const other = await addEmployee(t.ctx, { firstName: "Olga", lastName: "O", payType: "DAILY", rate: 700 });
    await prisma.timeEntry.create({
      data: {
        companyId: t.company.id,
        employeeId: other.id,
        clockInAt: new Date(now - 20 * 3600_000),
        inSource: "MOBILE",
      },
    });
    await detectScheduled();
    const x = await prisma.timeException.findMany({ where: { companyId: t.company.id } });
    expect(x.map((e) => e.type).sort()).toEqual(["MISSED_CLOCK_OUT", "NO_SHOW"]);
  });

  it("does nothing on the Free plan", async () => {
    const t = await makeCompany({ plan: "FREE" });
    created.push(t.company.id);
    await prisma.timeEntry.create({
      data: {
        companyId: t.company.id,
        employeeId: t.owner.id,
        clockInAt: new Date(Date.now() - 20 * 3600_000),
        inSource: "MOBILE",
      },
    });
    await detectScheduled();
    expect(await prisma.timeException.count({ where: { companyId: t.company.id } })).toBe(0);
  });
});

describe("leave", () => {
  it("grants SIL only after a year of service", () => {
    expect(silEligible(new Date("2025-01-10T00:00:00Z"), "2026-01-09")).toBe(false);
    expect(silEligible(new Date("2025-01-10T00:00:00Z"), "2026-01-11")).toBe(true);
    expect(silEligible(null, "2026-01-11")).toBe(false);
  });

  it("counts working days, enforces balances and approval", async () => {
    const t = await makeCompany({ plan: "STARTER" });
    created.push(t.company.id);
    const emp = await addEmployee(t.ctx, {
      firstName: "Pia",
      lastName: "P",
      payType: "DAILY",
      rate: 700,
      hireDate: "2020-01-01",
      restDays: [0],
    });
    const sil = await prisma.leaveType.findFirstOrThrow({ where: { companyId: t.company.id, code: "SIL" } });
    const ctx = { ...t.ctx, employee: emp, role: "EMPLOYEE" as const, isManager: false, isAdmin: false };
    // Mon 2026-11-30 is Bonifacio Day (regular holiday) → Sat 28 to Tue Dec 1 counts Sat, Tue = 2 days (Sun rest, Mon holiday)
    const req = await requestLeave(ctx as never, {
      leaveTypeId: sil.id,
      startDate: "2026-11-28",
      endDate: "2026-12-01",
    });
    expect(req.days).toBe(2);
    await expect(
      requestLeave(ctx as never, { leaveTypeId: sil.id, startDate: "2026-11-28", endDate: "2026-11-28" }),
    ).rejects.toThrow(/already have leave/);
    await expect(
      requestLeave(ctx as never, { leaveTypeId: sil.id, startDate: "2026-12-02", endDate: "2026-12-09" }),
    ).rejects.toThrow(/Not enough/);
    await decideLeave(t.ctx, req.id, true);
    const bal = (await leaveBalances(t.ctx, emp, 2026)).find((b) => b.type.code === "SIL")!;
    expect(bal).toMatchObject({ entitled: 5, used: 2, remaining: 3 });
    expect(addDays("2026-11-28", 3)).toBe("2026-12-01");
  });
});

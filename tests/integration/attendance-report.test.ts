import { afterAll, describe, expect, it } from "vitest";
import { atMinute, keyToUtcDate } from "@/lib/time";
import { prisma } from "@/server/db";
import { attendanceCsvRows, attendanceWorkbook } from "@/server/reports/attendance-workbook";
import { buildAttendanceReport } from "@/server/services/attendance-report";
import { addEmployee } from "@/server/services/team";
import { punch, type PunchActor } from "@/server/services/timeclock";
import { asMember, cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));

const TZ = "Asia/Manila";
// A past cutoff with a Monday–Friday week: Oct 5–9, 2026.
const PERIOD = { start: "2026-10-05", end: "2026-10-09" };

describe("cutoff attendance report", () => {
  it("shows time in/out, approved vs pending OT, leave, absences and branch totals", async () => {
    const t = await makeCompany({ plan: "ENTERPRISE" });
    created.push(t.company.id);
    const branch = t.location!;
    const other = await prisma.location.create({
      data: { companyId: t.company.id, name: "Cebu", code: "CEB" },
    });
    const ana = await addEmployee(t.ctx, {
      firstName: "Ana",
      lastName: "Cruz",
      rate: 700,
      restDays: [0, 6],
      departmentName: "Ops",
      locationIds: [branch.id],
    });
    const ben = await addEmployee(t.ctx, {
      firstName: "Ben",
      rate: 600,
      restDays: [0, 6],
      locationIds: [other.id],
    });
    const actor: PunchActor = {
      companyId: t.company.id,
      timezone: TZ,
      plan: "ENTERPRISE",
      settings: t.ctx.settings,
      employee: ana,
    };
    for (const day of ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"])
      await prisma.shift.create({
        data: {
          companyId: t.company.id,
          employeeId: ana.id,
          locationId: branch.id,
          startAt: atMinute(day, 8 * 60, TZ),
          endAt: atMinute(day, 17 * 60, TZ),
          status: "PUBLISHED",
        },
      });
    const tap = (day: string, min: number) =>
      punch(actor, {
        action: "TOGGLE",
        source: "BIOMETRIC",
        method: "FINGERPRINT",
        offline: true,
        at: atMinute(day, min, TZ),
      });
    // Mon: on time. Tue: 20 min late, 2h OT (approved 1h). Wed: absent. Thu: vacation leave. Fri: worked.
    await tap("2026-10-05", 8 * 60);
    await tap("2026-10-05", 17 * 60);
    await tap("2026-10-06", 8 * 60 + 20);
    await tap("2026-10-06", 19 * 60);
    await tap("2026-10-09", 7 * 60 + 55);
    await tap("2026-10-09", 17 * 60);
    await prisma.overtimeRequest.create({
      data: {
        companyId: t.company.id,
        employeeId: ana.id,
        date: keyToUtcDate("2026-10-06"),
        minutes: 60,
        status: "APPROVED",
      },
    });
    const vl = await prisma.leaveType.findFirstOrThrow({ where: { companyId: t.company.id, code: "VL" } });
    await prisma.leaveRequest.create({
      data: {
        companyId: t.company.id,
        employeeId: ana.id,
        leaveTypeId: vl.id,
        startDate: keyToUtcDate("2026-10-08"),
        endDate: keyToUtcDate("2026-10-08"),
        days: 1,
        status: "APPROVED",
      },
    });

    const report = await buildAttendanceReport(t.ctx, PERIOD);
    const rows = report.daily.filter((d) => d.employeeId === ana.id);
    const day = (k: string) => rows.find((r) => r.date === k)!;
    expect(day("2026-10-05").timeIn).toBe("8:00 AM");
    expect(day("2026-10-05").methods).toBe("Fingerprint");
    expect(day("2026-10-06").lateMinutes).toBe(20);
    expect(day("2026-10-06").overtimeMinutes).toBe(100); // 8:20–19:00 less the meal hour
    expect(day("2026-10-06").approvedOvertimeMinutes).toBe(60);
    expect(day("2026-10-06").pendingOvertimeMinutes).toBe(40);
    expect(day("2026-10-07").absent).toBe(true);
    expect(day("2026-10-08").leave).toBe("Vacation leave");
    expect(day("2026-10-08").absent).toBe(false);

    const s = report.summary.find((x) => x.employeeId === ana.id)!;
    expect(s.daysPresent).toBe(3);
    expect(s.absences).toBe(1);
    expect(s.paidLeaveDays).toBe(1);
    expect(report.branches.map((b) => b.branch).sort()).toEqual(["Cebu", "HQ"]);

    // Filters and branch scope
    const byBranch = await buildAttendanceReport(t.ctx, PERIOD, { locationId: other.id });
    expect(byBranch.summary.map((x) => x.employeeId)).toEqual([ben.id]);
    const supervisor = asMember(t.ctx, ben, "MANAGER", { locationIds: [other.id] });
    const scoped = await buildAttendanceReport(supervisor, PERIOD);
    expect(scoped.summary.map((x) => x.employeeId)).toEqual([ben.id]);

    // Exports
    const csv = attendanceCsvRows(report, "daily");
    expect(csv[0]).toContain("OT Approved (h)");
    const xlsx = await attendanceWorkbook(report, "test");
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
  });
});

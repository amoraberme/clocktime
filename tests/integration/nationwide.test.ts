import { afterAll, describe, expect, it } from "vitest";
import { dateKey, startOfDay } from "@/lib/time";
import { prisma } from "@/server/db";
import { nationwideToday } from "@/server/queries/nationwide";
import { addEmployee } from "@/server/services/team";
import { punch } from "@/server/services/timeclock";
import { asMember, cleanup, makeCompany } from "./helpers";

const created: string[] = [];
afterAll(() => cleanup(created));

const HOUR = 3600_000;
const ago = (h: number) => new Date(Math.floor(Date.now() / 60_000) * 60_000 - h * HOUR);

describe("nationwide dashboard", () => {
  it("rolls up each branch by region and respects branch scope", async () => {
    const t = await makeCompany({ plan: "ENTERPRISE" });
    created.push(t.company.id);
    const vis = await prisma.region.create({ data: { companyId: t.company.id, name: "Visayas" } });
    const cebu = await prisma.location.create({
      data: { companyId: t.company.id, name: "Cebu", code: "CEB", regionId: vis.id },
    });
    const late = await addEmployee(t.ctx, { firstName: "Lara", rate: 600, locationIds: [cebu.id] });
    const away = await addEmployee(t.ctx, { firstName: "Abe", rate: 600, locationIds: [cebu.id] });
    const hq = await addEmployee(t.ctx, { firstName: "Hal", rate: 600, locationIds: [t.location!.id] });
    // Shifts that started 2h ago (kept within today by starting no earlier than local midnight).
    const midnight = startOfDay(dateKey(new Date(), "Asia/Manila"), "Asia/Manila").getTime();
    const start = new Date(Math.max(ago(2).getTime(), midnight + 5 * 60_000));
    for (const e of [late, away])
      await prisma.shift.create({
        data: {
          companyId: t.company.id,
          employeeId: e.id,
          locationId: cebu.id,
          startAt: start,
          endAt: new Date(start.getTime() + 8 * HOUR),
          status: "PUBLISHED",
        },
      });
    await punch(
      {
        companyId: t.company.id,
        timezone: "Asia/Manila",
        plan: "ENTERPRISE",
        settings: t.ctx.settings,
        employee: late,
      },
      {
        action: "CLOCK_IN",
        source: "KIOSK",
        kioskLocationId: cebu.id,
        offline: true,
        at: new Date(start.getTime() + 30 * 60_000),
      },
    );
    const regions = await nationwideToday(t.ctx);
    const visayas = regions.find((r) => r.region === "Visayas")!;
    const row = visayas.branches.find((b) => b.id === cebu.id)!;
    expect(row).toMatchObject({ headcount: 2, scheduled: 2, present: 1, late: 1, absent: 1 });
    expect(regions.map((r) => r.region)).toEqual(["Visayas", "No region"]);

    const sup = asMember(t.ctx, hq, "MANAGER", { locationIds: [cebu.id] });
    const scoped = await nationwideToday(sup);
    expect(scoped.flatMap((r) => r.branches.map((b) => b.id))).toEqual([cebu.id]);
  });
});

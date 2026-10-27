import "server-only";
import { addDays, dateKey, keyToUtcDate, startOfDay } from "@/lib/time";
import type { AppContext } from "../context";
import { employeeScopeWhere } from "../scope";
import { isOnline } from "../services/terminals";

export type BranchToday = {
  id: string;
  name: string;
  code: string | null;
  region: string;
  headcount: number;
  scheduled: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  fieldOnDuty: number;
  exceptions: number;
  terminals: number;
  terminalsOffline: number;
};

export type RegionToday = {
  region: string;
  branches: BranchToday[];
  totals: Omit<BranchToday, "id" | "name" | "code" | "region">;
};

const ZERO = {
  headcount: 0,
  scheduled: 0,
  present: 0,
  late: 0,
  absent: 0,
  onLeave: 0,
  fieldOnDuty: 0,
  exceptions: 0,
  terminals: 0,
  terminalsOffline: 0,
};

/**
 * Today at every branch the user can see, grouped by region: who's scheduled, on the clock, late,
 * absent, on leave or out in the field, open exceptions, and terminal health.
 */
export async function nationwideToday(ctx: AppContext): Promise<RegionToday[]> {
  const tz = ctx.company.timezone;
  const today = dateKey(new Date(), tz);
  const dayStart = startOfDay(today, tz);
  const dayEnd = startOfDay(addDays(today, 1), tz);
  const now = new Date();
  const scope = ctx.managedLocationIds ? { id: { in: ctx.managedLocationIds } } : {};
  const [locations, employees, shifts, entries, leave, exceptions, terminals] = await Promise.all([
    ctx.db.location.findMany({
      where: { archivedAt: null, ...scope },
      include: { region: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    ctx.db.employee.findMany({
      where: { status: { not: "ARCHIVED" }, ...employeeScopeWhere(ctx) },
      select: { id: true, fieldWork: true, locations: { select: { locationId: true } } },
    }),
    ctx.db.shift.findMany({
      where: { status: "PUBLISHED", startAt: { gte: dayStart, lt: dayEnd }, employeeId: { not: null } },
      select: { employeeId: true, locationId: true, startAt: true, endAt: true },
    }),
    ctx.db.timeEntry.findMany({
      where: { OR: [{ clockInAt: { gte: dayStart, lt: dayEnd } }, { clockOutAt: null }] },
      select: { employeeId: true, locationId: true, clockInAt: true, clockOutAt: true, flags: true },
    }),
    ctx.can("leave")
      ? ctx.db.leaveRequest.findMany({
          where: {
            status: "APPROVED",
            startDate: { lte: keyToUtcDate(today) },
            endDate: { gte: keyToUtcDate(today) },
          },
          select: { employeeId: true },
        })
      : [],
    ctx.can("exceptions")
      ? ctx.db.timeException.groupBy({ by: ["employeeId"], where: { status: "OPEN" }, _count: true })
      : [],
    ctx.can("biometricDevices")
      ? ctx.db.attendanceDevice.findMany({
          where: { status: "ACTIVE" },
          select: { locationId: true, lastSeenAt: true },
        })
      : [],
  ]);
  const inScope = new Set(employees.map((e) => e.id));
  const onLeave = new Set(leave.map((l) => l.employeeId));
  const exceptionCount = new Map(exceptions.map((x) => [x.employeeId, x._count]));
  const grace = ctx.settings.lateGraceMinutes * 60_000;
  const open = entries.filter((e) => !e.clockOutAt && !e.flags.includes("MISSING_OUT"));

  const regions = new Map<string, BranchToday[]>();
  for (const loc of locations) {
    const staff = employees.filter((e) => e.locations.some((l) => l.locationId === loc.id));
    const staffIds = new Set(staff.map((e) => e.id));
    const here = shifts.filter((s) => s.locationId === loc.id && inScope.has(s.employeeId!));
    let late = 0;
    let absent = 0;
    for (const s of here) {
      if (s.startAt.getTime() + grace > now.getTime()) continue;
      const first = entries
        .filter(
          (e) =>
            e.employeeId === s.employeeId &&
            e.clockInAt < s.endAt &&
            (e.clockOutAt ?? now) > new Date(s.startAt.getTime() - 4 * 3600_000),
        )
        .sort((a, b) => a.clockInAt.getTime() - b.clockInAt.getTime())[0];
      if (!first) {
        if (!onLeave.has(s.employeeId!)) absent++;
      } else if (first.clockInAt.getTime() > s.startAt.getTime() + grace) late++;
    }
    const branchTerminals = terminals.filter((t) => t.locationId === loc.id);
    const row: BranchToday = {
      id: loc.id,
      name: loc.name,
      code: loc.code,
      region: loc.region?.name ?? "",
      headcount: staff.length,
      scheduled: here.length,
      present: open.filter((e) => e.locationId === loc.id && inScope.has(e.employeeId)).length,
      late,
      absent,
      onLeave: staff.filter((e) => onLeave.has(e.id)).length,
      fieldOnDuty: staff.filter((e) => e.fieldWork && open.some((o) => o.employeeId === e.id)).length,
      exceptions: [...staffIds].reduce((t, id) => t + (exceptionCount.get(id) ?? 0), 0),
      terminals: branchTerminals.length,
      terminalsOffline: branchTerminals.filter((t) => !isOnline(t)).length,
    };
    const key = row.region || "No region";
    regions.set(key, [...(regions.get(key) ?? []), row]);
  }
  return [...regions.entries()]
    .sort(([a], [b]) => (a === "No region" ? 1 : b === "No region" ? -1 : a.localeCompare(b)))
    .map(([region, branches]) => ({
      region,
      branches,
      totals: branches.reduce(
        (t, b) => {
          for (const k of Object.keys(ZERO) as (keyof typeof ZERO)[]) t[k] += b[k];
          return t;
        },
        { ...ZERO },
      ),
    }));
}

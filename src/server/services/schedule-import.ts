import "server-only";
import { normalizeUserId } from "@/lib/identifiers";
import { addDays, atMinute, startOfDay } from "@/lib/time";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import type { AppContext } from "../context";
import { prisma } from "../db";
import { employeeScopeWhere } from "../scope";
import { rebuildForSchedule, type ScheduleChange } from "./attendance/relink";
import { notify } from "./notifications";

export const SCHEDULE_CSV_COLUMNS = [
  "employee_no",
  "date",
  "start",
  "end",
  "branch",
  "break_minutes",
] as const;
export const MAX_SCHEDULE_ROWS = 5000;

export type ScheduleRowResult = { row: number; ok: boolean; name?: string; summary?: string; error?: string };

const REST = /^(off|rest|rd|day ?off|-)$/i;

/** `2026-10-13`, `10/13/2026` or `13/10/2026` when the day can't be a month. */
export function parseCsvDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const [a, b, y] = [+m[1]!, +m[2]!, +m[3]!];
    return a > 12 ? valid(y, b, a) : valid(y, a, b);
  }
  return null;
}

function valid(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Minutes after midnight from `07:00`, `7:00 PM`, `1900` or `19:00:00`. */
export function parseCsvTime(raw: string): number | null {
  const s = raw.trim().toUpperCase();
  const m = /^(\d{1,2}):?(\d{2})(?::\d{2})?\s*(AM|PM)?$/.exec(s);
  if (!m) return null;
  let h = +m[1]!;
  const min = +m[2]!;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === "PM" ? 12 : 0);
  } else if (h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

function cell(row: Record<string, string>, ...keys: string[]) {
  for (const [k, v] of Object.entries(row)) {
    const key = k
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (keys.includes(key)) return (v ?? "").trim();
  }
  return "";
}

/**
 * Import a schedule from CSV (one row per person per day). Every person/date in the file replaces
 * whatever was scheduled that day, so a re-upload after a schedule change just works. `OFF` or
 * `REST` in the start column makes it a rest day. End before start is an overnight shift; start =
 * end is a 24-hour duty. Published imports re-pair attendance and notify people.
 */
export async function importSchedule(
  ctx: AppContext,
  rows: Record<string, string>[],
  opts: { dryRun: boolean; publish: boolean },
) {
  if (!rows.length) throw new UserError("The file has no rows.");
  if (rows.length > MAX_SCHEDULE_ROWS)
    throw new UserError(`Import up to ${MAX_SCHEDULE_ROWS} rows at a time.`);
  const tz = ctx.company.timezone;
  const [employees, locations] = await Promise.all([
    ctx.db.employee.findMany({
      where: { status: { not: "ARCHIVED" }, ...employeeScopeWhere(ctx) },
      select: {
        id: true,
        employeeNo: true,
        deviceUserId: true,
        firstName: true,
        lastName: true,
        locations: { select: { locationId: true } },
      },
    }),
    ctx.db.location.findMany({
      where: {
        archivedAt: null,
        ...(ctx.managedLocationIds ? { id: { in: ctx.managedLocationIds } } : {}),
      },
      select: { id: true, name: true, code: true },
    }),
  ]);
  const byNo = new Map<string, (typeof employees)[number]>();
  for (const e of employees) {
    if (e.employeeNo) byNo.set(normalizeUserId(e.employeeNo), e);
    if (e.deviceUserId && !byNo.has(normalizeUserId(e.deviceUserId)))
      byNo.set(normalizeUserId(e.deviceUserId), e);
  }
  const byBranch = new Map<string, (typeof locations)[number]>();
  for (const l of locations) {
    byBranch.set(l.name.trim().toLowerCase(), l);
    if (l.code) byBranch.set(l.code.trim().toLowerCase(), l);
  }

  const results: ScheduleRowResult[] = [];
  const plan: {
    employeeId: string;
    date: string;
    shift: { startAt: Date; endAt: Date; locationId: string; breakMinutes: number } | null;
  }[] = [];
  const seen = new Set<string>();
  const maxMinutes = ctx.settings.maxShiftHours * 60;
  rows.forEach((row, i) => {
    const line = i + 2;
    const fail = (error: string, name?: string) => results.push({ row: line, ok: false, error, name });
    const no = cell(row, "employee_no", "employee_number", "employee_id", "emp_no", "id_no");
    const emp = no ? byNo.get(normalizeUserId(no)) : undefined;
    if (!emp) return fail(no ? `No one with employee no. ${no} in your scope` : "Missing employee_no");
    const name = `${emp.firstName} ${emp.lastName}`.trim();
    const date = parseCsvDate(cell(row, "date", "work_date", "duty_date"));
    if (!date) return fail("Date must be YYYY-MM-DD or MM/DD/YYYY", name);
    const key = `${emp.id}:${date}`;
    if (seen.has(key)) return fail(`${name} is listed twice on ${date}. Put split shifts in one row.`, name);
    seen.add(key);
    const startRaw = cell(row, "start", "time_in", "start_time", "in");
    if (!startRaw || REST.test(startRaw)) {
      plan.push({ employeeId: emp.id, date, shift: null });
      return results.push({ row: line, ok: true, name, summary: `${date} rest day` });
    }
    const s = parseCsvTime(startRaw);
    const e0 = parseCsvTime(cell(row, "end", "time_out", "end_time", "out"));
    if (s == null || e0 == null) return fail("Start and end must be times like 07:00 or 7:00 PM", name);
    const e = e0 <= s ? e0 + 1440 : e0;
    if (e - s > maxMinutes)
      return fail(`Longer than the ${ctx.settings.maxShiftHours}h shift limit (Settings → Time rules)`, name);
    const branchRaw = cell(row, "branch", "branch_code", "location", "site");
    const loc = branchRaw
      ? byBranch.get(branchRaw.toLowerCase())
      : locations.find((l) => emp.locations.some((x) => x.locationId === l.id));
    if (!loc)
      return fail(
        branchRaw ? `Unknown branch "${branchRaw}"` : `${name} has no branch; add a branch column`,
        name,
      );
    const brk = cell(row, "break_minutes", "break");
    const breakMinutes = brk ? Number(brk) : 60;
    if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 240)
      return fail("break_minutes must be 0–240", name);
    const startAt = atMinute(date, s, tz);
    const endAt = atMinute(date, e, tz);
    plan.push({ employeeId: emp.id, date, shift: { startAt, endAt, locationId: loc.id, breakMinutes } });
    const hrs = (e - s) / 60;
    results.push({
      row: line,
      ok: true,
      name,
      summary: `${date} ${startRaw}–${cell(row, "end", "time_out", "end_time", "out")} at ${loc.name}${hrs >= 20 ? ` (${hrs}h duty)` : e0 <= s ? " (overnight)" : ""}`,
    });
  });
  if (opts.dryRun || results.some((r) => !r.ok)) return { results, created: 0, cleared: 0, imported: false };

  const changes: ScheduleChange[] = [];
  let created = 0;
  let cleared = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const p of plan) {
        const dayStart = startOfDay(p.date, tz);
        const dayEnd = startOfDay(addDays(p.date, 1), tz);
        const old = await tx.shift.findMany({
          where: {
            companyId: ctx.company.id,
            employeeId: p.employeeId,
            startAt: { gte: dayStart, lt: dayEnd },
          },
          select: { id: true, status: true, startAt: true, endAt: true },
        });
        if (old.length) {
          await tx.shift.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
          cleared += old.length;
          for (const o of old)
            if (o.status === "PUBLISHED")
              changes.push({ employeeId: p.employeeId, from: o.startAt, to: o.endAt });
        }
        if (p.shift) {
          await tx.shift.create({
            data: {
              companyId: ctx.company.id,
              employeeId: p.employeeId,
              ...p.shift,
              status: opts.publish ? "PUBLISHED" : "DRAFT",
              publishedAt: opts.publish ? new Date() : null,
              notes: "Imported",
            },
          });
          created++;
          if (opts.publish)
            changes.push({ employeeId: p.employeeId, from: p.shift.startAt, to: p.shift.endAt });
        }
      }
    },
    { timeout: 120_000 },
  );
  await writeAudit(actorFrom(ctx), {
    action: "schedule.import",
    entityType: "Schedule",
    entityId: plan[0]?.date ?? "",
    after: { rows: plan.length, created, cleared, published: opts.publish },
  });
  if (changes.length)
    await rebuildForSchedule({ id: ctx.company.id, timezone: tz, settings: ctx.settings }, changes);
  if (opts.publish)
    for (const employeeId of new Set(plan.map((p) => p.employeeId)))
      await notify(ctx.company.id, employeeId, {
        kind: "schedule.published",
        title: "Your schedule was updated",
        body: "New shifts were posted. Tap to review.",
        url: "/me/schedule",
      });
  return { results, created, cleared, imported: true };
}

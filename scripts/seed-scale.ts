/**
 * Seeds "Scale Test Corp", a nationwide Enterprise company at production scale, for the local
 * production copy (docker-compose.prod.yml) and load tests:
 *   - 4 regions, 12 branches with terminals, 6 departments
 *   - 1,500 people (default): office staff on fingerprint terminals, night warehouse crew crossing
 *     midnight, 24-hour guards on RFID cards, drivers and sales on phones (some offline)
 *   - 90 days (default) of published shifts and punches ending yesterday, with lateness,
 *     undertime, absences, missing clock-outs, long duties, double taps, leave, overtime
 *     requests, corrections and schedule changes
 * Punches are inserted in bulk, then every person's attendance is built by the real pairing
 * engine (rebuildAttendance) and exception detectors, so the data looks exactly like production.
 *
 *   pnpm seed:scale [--employees 1500] [--days 90] [--no-payroll]
 *   pnpm seed:scale --payroll-only      # recompute the last cutoff's payroll on the seeded data
 *
 * Every person can sign in: emp00001@scale.demo.clocktime.ph … / demo12345, plus owner@, hr@,
 * timekeeper@ and supervisor.<branch code>@ on the same domain. Re-running replaces the company.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { PunchAction, PunchSource } from "../src/generated/prisma/enums";
import { hasFeature } from "../src/lib/entitlements";
import { DEFAULT_SETTINGS, parseSettings } from "../src/lib/settings";
import {
  addDays,
  atMinute,
  dateKey,
  eachDay,
  keyToUtcDate,
  payPeriodFor,
  previousPayPeriod,
  weekday,
} from "../src/lib/time";
import { canApprove, type AppContext, type Approval } from "../src/server/context";
import { cardLookup, encrypt, hashSecret, pinLookup } from "../src/server/crypto";
import { prisma } from "../src/server/db";
import { rebuildAttendance } from "../src/server/services/attendance/rebuild";
import { DEFAULT_LEAVE_TYPES } from "../src/server/services/company";
import { detectOnPunch, raiseRebuildIssues } from "../src/server/services/exceptions";
import { computePayRun, createPayRun } from "../src/server/services/payroll";
import { tenantDb } from "../src/server/tenant";

const TZ = "Asia/Manila";
const SLUG = "scale-test";
const DOMAIN = "scale.demo.clocktime.ph";
const PASSWORD = "demo12345";

const args = process.argv.slice(2);
const opt = (name: string, d: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const EMPLOYEES = opt("employees", 1500);
const DAYS = opt("days", 90);
const PAYROLL = !args.includes("--no-payroll");
const PARALLEL = opt("parallel", 8);

// Deterministic randomness: the same data on every run.
let seed = 20261028;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const minutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const dayKeyOf = (d: Date) => dateKey(d, TZ);

const REGIONS = [
  { key: "NCR", name: "NCR" },
  { key: "CL", name: "Central Luzon" },
  { key: "VIS", name: "Visayas" },
  { key: "MIN", name: "Mindanao" },
] as const;
const BRANCHES = [
  { code: "MNL-HQ", name: "Manila HQ", region: "NCR", lat: 14.5547, lng: 121.0244 },
  { code: "QC-01", name: "Quezon City Hub", region: "NCR", lat: 14.676, lng: 121.0437 },
  { code: "PSG-01", name: "Pasig Depot", region: "NCR", lat: 14.5764, lng: 121.0851 },
  { code: "CRK-01", name: "Clark Hub", region: "CL", lat: 15.1858, lng: 120.56 },
  { code: "SFP-01", name: "San Fernando Depot", region: "CL", lat: 15.0286, lng: 120.6898 },
  { code: "BUL-01", name: "Bulacan Warehouse", region: "CL", lat: 14.7942, lng: 120.8799 },
  { code: "CEB-01", name: "Cebu Depot", region: "VIS", lat: 10.3157, lng: 123.8854 },
  { code: "ILO-01", name: "Iloilo Hub", region: "VIS", lat: 10.7202, lng: 122.5621 },
  { code: "BAC-01", name: "Bacolod Depot", region: "VIS", lat: 10.6765, lng: 122.9509 },
  { code: "DVO-01", name: "Davao Depot", region: "MIN", lat: 7.0731, lng: 125.6128 },
  { code: "CDO-01", name: "Cagayan de Oro Hub", region: "MIN", lat: 8.4542, lng: 124.6319 },
  { code: "GES-01", name: "General Santos Depot", region: "MIN", lat: 6.1164, lng: 125.1716 },
] as const;
const DEPARTMENTS = ["Admin", "Operations", "Warehouse", "Security", "Sales", "Logistics"] as const;
const FIRST = [
  "Maria",
  "Jose",
  "Ana",
  "Juan",
  "Grace",
  "Mark",
  "Liza",
  "Rico",
  "Joy",
  "Ben",
  "Tess",
  "Carlo",
  "Bea",
  "Paolo",
  "Kris",
  "Jun",
  "Rosa",
  "Edwin",
  "Lito",
  "Vince",
  "Andrea",
  "Ramon",
  "Nestor",
  "Dennis",
  "Aileen",
  "Jomar",
  "Cathy",
  "Ronald",
  "Mae",
  "Arnel",
];
const LAST = [
  "Dela Cruz",
  "Santos",
  "Reyes",
  "Garcia",
  "Mendoza",
  "Bautista",
  "Aquino",
  "Flores",
  "Villanueva",
  "Castro",
  "Ramos",
  "Torres",
  "Navarro",
  "Salazar",
  "Ocampo",
  "Lopez",
  "Rivera",
  "Manalo",
  "Aguilar",
  "Dizon",
  "Pascual",
  "Lim",
  "Tan",
  "Cruz",
  "Gonzales",
];

type Kind = "office" | "night" | "guard" | "driver" | "sales";
type Person = {
  id: string;
  no: number;
  kind: Kind;
  branch: number;
  dept: string;
  role: "OWNER" | "HR" | "TIMEKEEPER" | "MANAGER" | "EMPLOYEE";
  email: string;
  first: string;
  last: string;
  restDays: number[];
  userId: string;
};

function kindFor(i: number): Kind {
  const r = (i * 0.618034) % 1; // spread kinds evenly across branches
  if (r < 0.55) return "office";
  if (r < 0.7) return "night";
  if (r < 0.8) return "guard";
  return r < 0.92 ? "driver" : "sales";
}

type ShiftSpec = { start: Date; end: Date };
function shiftsFor(p: Person, days: string[], holidays: Set<string>): ShiftSpec[] {
  const out: ShiftSpec[] = [];
  days.forEach((day, i) => {
    const wd = weekday(day);
    const at = (m: number) => atMinute(day, m, TZ);
    switch (p.kind) {
      case "office":
      case "sales":
        if (wd !== 0 && wd !== 6 && !holidays.has(day)) out.push({ start: at(8 * 60), end: at(17 * 60) });
        break;
      case "night":
        if (wd === 0) break;
        // A mid-period schedule change: one crew member per branch on days for a week.
        if (p.no % 37 === 0 && i >= 40 && i < 47) out.push({ start: at(8 * 60), end: at(17 * 60) });
        else out.push({ start: at(22 * 60), end: at(30 * 60) });
        break;
      case "guard":
        if ((i + p.no) % 3 === 0) out.push({ start: at(8 * 60), end: at(32 * 60) }); // 24 on, 48 off
        break;
      case "driver":
        if (wd !== 0) out.push({ start: at(6 * 60), end: at(15 * 60) });
        break;
    }
  });
  return out;
}

async function inBatches<T>(rows: T[], size: number, write: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await write(rows.slice(i, i + size));
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

const t0 = Date.now();
const step = (label: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

async function main() {
  step(`Seeding ${EMPLOYEES} employees × ${DAYS} days`);
  const old = await prisma.company.findUnique({ where: { slug: SLUG } });
  if (old) {
    step("Removing the previous Scale Test Corp");
    await prisma.company.delete({ where: { id: old.id } });
  }
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });

  const settings = { ...DEFAULT_SETTINGS, maxShiftHours: 24 };
  const company = await prisma.company.create({
    data: {
      name: "Scale Test Corp",
      slug: SLUG,
      joinCode: "SCALE001",
      industry: "Logistics",
      timezone: TZ,
      payFrequency: "SEMI_MONTHLY",
      settings,
      plan: "ENTERPRISE",
      planStatus: "ACTIVE",
      paidThrough: new Date(Date.now() + 365 * 86_400_000),
      onboardedAt: new Date(),
    },
  });
  await prisma.leaveType.createMany({
    data: DEFAULT_LEAVE_TYPES.map((t) => ({ ...t, companyId: company.id })),
  });
  const leaveTypes = await prisma.leaveType.findMany({ where: { companyId: company.id } });
  const lt = (code: string) => leaveTypes.find((t) => t.code === code)!.id;

  const regionIds = new Map<string, string>();
  for (const r of REGIONS)
    regionIds.set(
      r.key,
      (await prisma.region.create({ data: { companyId: company.id, name: r.name, code: r.key } })).id,
    );
  const branches: ((typeof BRANCHES)[number] & { id: string; deviceId: string })[] = [];
  for (const b of BRANCHES) {
    const loc = await prisma.location.create({
      data: {
        companyId: company.id,
        name: b.name,
        code: b.code,
        regionId: regionIds.get(b.region)!,
        latitude: b.lat,
        longitude: b.lng,
        radiusMeters: 200,
        geofenceMode: "WARN",
      },
    });
    const device = await prisma.attendanceDevice.create({
      data: {
        companyId: company.id,
        name: `${b.name} gate`,
        serialNumber: `SCALE${b.code.replace(/-/g, "")}`,
        locationId: loc.id,
        lastSeenAt: new Date(),
      },
    });
    branches.push({ ...b, id: loc.id, deviceId: device.id });
  }
  const deptIds = new Map<string, string>();
  for (const d of DEPARTMENTS)
    deptIds.set(d, (await prisma.department.create({ data: { companyId: company.id, name: d } })).id);
  const days = eachDay(addDays(dateKey(new Date(), TZ), -DAYS), addDays(dateKey(new Date(), TZ), -1));
  const holidays = new Set(
    (
      await prisma.holiday.findMany({
        where: {
          OR: [{ companyId: null }, { companyId: company.id }],
          date: { gte: keyToUtcDate(days[0]!), lte: keyToUtcDate(days.at(-1)!) },
        },
        select: { date: true },
      })
    ).map((h) => h.date.toISOString().slice(0, 10)),
  );
  step(`Company, ${branches.length} branches and terminals ready; ${holidays.size} holidays in range`);

  // People: owner, HR, timekeeper, one supervisor per branch, then staff.
  const people: Person[] = [];
  const add = (
    p: Omit<Person, "id" | "userId" | "first" | "last" | "restDays"> & { first?: string; last?: string },
  ) => {
    const restDays = p.kind === "guard" ? [] : p.kind === "office" || p.kind === "sales" ? [0, 6] : [0];
    people.push({
      ...p,
      id: randomUUID(),
      userId: randomUUID(),
      first: p.first ?? pick(FIRST),
      last: p.last ?? pick(LAST),
      restDays,
    });
  };
  add({
    no: 1,
    kind: "office",
    branch: 0,
    dept: "Admin",
    role: "OWNER",
    email: "owner",
    first: "Andrea",
    last: "Lim",
  });
  add({
    no: 2,
    kind: "office",
    branch: 0,
    dept: "Admin",
    role: "HR",
    email: "hr",
    first: "Bea",
    last: "Santos",
  });
  add({
    no: 3,
    kind: "office",
    branch: 0,
    dept: "Admin",
    role: "TIMEKEEPER",
    email: "timekeeper",
    first: "Carlo",
    last: "Reyes",
  });
  BRANCHES.forEach((b, i) =>
    add({
      no: 4 + i,
      kind: "office",
      branch: i,
      dept: "Operations",
      role: "MANAGER",
      email: `supervisor.${b.code.toLowerCase()}`,
    }),
  );
  for (let no = people.length + 1; no <= EMPLOYEES; no++) {
    const kind = kindFor(no);
    const dept =
      kind === "night"
        ? "Warehouse"
        : kind === "guard"
          ? "Security"
          : kind === "sales"
            ? "Sales"
            : kind === "driver"
              ? "Logistics"
              : "Operations";
    add({
      no,
      kind,
      branch: no % BRANCHES.length,
      dept,
      role: "EMPLOYEE",
      email: `emp${String(no).padStart(5, "0")}`,
    });
  }

  // Logins: one password hash shared by every test account (the salt lives inside the hash).
  const hash = await hashPassword(PASSWORD);
  await inBatches(people, 1000, (batch) =>
    prisma.user.createMany({
      data: batch.map((p) => ({
        id: p.userId,
        name: `${p.first} ${p.last}`,
        email: `${p.email}@${DOMAIN}`,
        emailVerified: true,
        activeCompanyId: company.id,
      })),
    }),
  );
  await inBatches(people, 1000, (batch) =>
    prisma.account.createMany({
      data: batch.map((p) => ({
        id: randomUUID(),
        accountId: p.userId,
        providerId: "credential",
        userId: p.userId,
        password: hash,
      })),
    }),
  );
  const kioskPinHash = await hashSecret("123456");
  await inBatches(people, 1000, (batch) =>
    prisma.employee.createMany({
      data: batch.map((p) => {
        const employeeNo = String(p.no).padStart(5, "0");
        const card = p.kind === "guard" ? String(4_100_000 + p.no * 137) : null;
        // Unique kiosk PINs for office staff (the hash is shared, the lookup is per PIN).
        const pin = p.kind === "office" ? String(100000 + p.no) : null;
        return {
          id: p.id,
          companyId: company.id,
          userId: p.userId,
          firstName: p.first,
          lastName: p.last,
          email: `${p.email}@${DOMAIN}`,
          employeeNo,
          deviceUserId: String(p.no),
          cardEnc: card ? encrypt(card) : null,
          cardLookup: card ? cardLookup(company.id, card) : null,
          pinHash: pin ? kioskPinHash : null,
          pinLookup: pin ? pinLookup(company.id, pin) : null,
          role: p.role,
          status: "ACTIVE" as const,
          payType: p.role === "OWNER" || p.role === "HR" ? ("MONTHLY" as const) : ("DAILY" as const),
          rateCentavos:
            p.role === "OWNER" ? 8_500_000 : p.role === "HR" ? 4_500_000 : between(560, 820) * 100,
          workDaysPerYear: p.kind === "guard" ? 365 : 313,
          timeExempt: p.role === "OWNER",
          restDays: p.restDays,
          fieldWork: p.kind === "driver" || p.kind === "sales",
          roaming: p.kind === "driver",
          hireDate: keyToUtcDate("2024-01-15"),
          departmentId: deptIds.get(p.dept)!,
          biometricConsentAt: new Date(),
          locationConsentAt: new Date(),
        };
      }),
    }),
  );
  await inBatches(people, 2000, (batch) =>
    prisma.employeeLocation.createMany({
      data: batch.map((p) => ({ employeeId: p.id, locationId: branches[p.branch]!.id })),
    }),
  );
  step(`${people.length} people with logins`);

  // Schedules and punches.
  type ShiftRow = {
    id: string;
    companyId: string;
    employeeId: string;
    locationId: string;
    startAt: Date;
    endAt: Date;
    breakMinutes: number;
    status: "PUBLISHED";
    publishedAt: Date;
    confirmedAt: Date;
  };
  type PunchRow = {
    companyId: string;
    employeeId: string;
    clientId: string;
    action: PunchAction;
    at: Date;
    receivedAt: Date;
    source: PunchSource;
    method: string;
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    locationId: string;
    deviceId: string | null;
    offline: boolean;
    accepted: boolean;
  };
  const shiftRows: ShiftRow[] = [];
  const punchRows: PunchRow[] = [];
  const leaveRows: {
    employeeId: string;
    type: string;
    start: string;
    end: string;
    days: number;
    approved: boolean;
  }[] = [];
  const otRows: { employeeId: string; day: string; minutes: number; approved: boolean }[] = [];
  const corrections: { employeeId: string; day: string; at: Date }[] = [];
  const scheduleChanges: { employeeId: string; shiftId: string; day: string; locationId: string }[] = [];
  const hr = people.find((p) => p.role === "HR")!;
  const now = new Date();

  for (const p of people) {
    if (p.role === "OWNER") continue;
    const branch = branches[p.branch]!;
    const shifts = shiftsFor(p, days, holidays);
    let leaveUntil = -1;
    let n = 0;
    const punch = (
      action: PunchAction,
      at: Date,
      source: PunchSource,
      method: string,
      extra: Partial<PunchRow> = {},
    ) => {
      if (at > now) return;
      const gps = source === "MOBILE";
      punchRows.push({
        companyId: company.id,
        employeeId: p.id,
        clientId: `scale:${p.no}:${n++}`,
        action,
        at,
        receivedAt: at,
        source,
        method,
        lat: gps ? branch.lat + (rand() - 0.5) * 0.2 : null,
        lng: gps ? branch.lng + (rand() - 0.5) * 0.2 : null,
        accuracy: gps ? between(5, 40) : null,
        locationId: branch.id,
        deviceId: source === "BIOMETRIC" ? branch.deviceId : null,
        offline: source === "BIOMETRIC",
        accepted: true,
        ...extra,
      });
    };
    shifts.forEach((s, i) => {
      const id = randomUUID();
      shiftRows.push({
        id,
        companyId: company.id,
        employeeId: p.id,
        locationId: branch.id,
        startAt: s.start,
        endAt: s.end,
        breakMinutes: 60,
        status: "PUBLISHED",
        publishedAt: s.start,
        confirmedAt: s.start,
      });
      const day = dayKeyOf(s.start);
      // Approved leave blocks (about 2% of shifts) and unexcused absences (about 2.5%).
      if (i <= leaveUntil) return;
      if (rand() < 0.006 && p.kind !== "guard") {
        const len = between(1, 3);
        leaveUntil = i + len - 1;
        const last = shifts[Math.min(i + len - 1, shifts.length - 1)]!;
        leaveRows.push({
          employeeId: p.id,
          type: pick(["VL", "SL", "VL", "SL", "UL"]),
          start: day,
          end: dayKeyOf(last.start),
          days: len,
          approved: rand() < 0.85,
        });
        return;
      }
      if (rand() < 0.025) return;
      if (rand() < 0.003) scheduleChanges.push({ employeeId: p.id, shiftId: id, day, locationId: branch.id });

      const late = rand() < 0.18 ? between(6, 45) : between(-20, 3);
      const inAt = minutes(s.start, late);
      let outAt = minutes(s.end, rand() < 0.1 ? between(-60, -10) : between(0, 15));
      if (p.kind !== "guard" && rand() < 0.2) {
        outAt = minutes(s.end, between(45, 180));
        const ot = Math.round((outAt.getTime() - s.end.getTime()) / 60_000);
        otRows.push({ employeeId: p.id, day, minutes: ot, approved: rand() < 0.65 });
      }
      if (p.kind === "guard") {
        otRows.push({ employeeId: p.id, day, minutes: 16 * 60, approved: true });
        if (rand() < 0.01) outAt = minutes(s.end, 6 * 60); // 30-hour duty for HR review
      }
      const missingOut = rand() < 0.015;
      if (missingOut && rand() < 0.5) corrections.push({ employeeId: p.id, day, at: outAt });

      switch (p.kind) {
        case "office": {
          const lunch = minutes(s.start, 4 * 60 + between(-5, 10));
          punch("TOGGLE", inAt, "BIOMETRIC", "FINGERPRINT");
          if (rand() < 0.005) punch("CLOCK_IN", minutes(inAt, 1), "MOBILE", "GPS"); // double tap
          punch("TOGGLE", lunch, "BIOMETRIC", "FINGERPRINT");
          punch("TOGGLE", minutes(lunch, between(50, 70)), "BIOMETRIC", "FINGERPRINT");
          if (!missingOut) punch("TOGGLE", outAt, "BIOMETRIC", "FINGERPRINT");
          break;
        }
        case "night":
          punch("TOGGLE", inAt, "BIOMETRIC", "FINGERPRINT");
          if (!missingOut) punch("TOGGLE", outAt, "BIOMETRIC", "FINGERPRINT");
          break;
        case "guard":
          punch("TOGGLE", inAt, "BIOMETRIC", "CARD");
          if (!missingOut) punch("TOGGLE", outAt, "BIOMETRIC", "CARD");
          break;
        case "driver":
        case "sales": {
          const offline = rand() < 0.15;
          const extra = offline ? { offline: true, receivedAt: minutes(outAt, between(30, 240)) } : {};
          punch("CLOCK_IN", inAt, "MOBILE", "GPS", extra);
          if (!missingOut) punch("CLOCK_OUT", outAt, "MOBILE", "GPS", extra);
          break;
        }
      }
    });
  }
  await inBatches(shiftRows, 5000, (batch) => prisma.shift.createMany({ data: batch }));
  step(`${shiftRows.length} shifts`);
  await inBatches(punchRows, 5000, (batch) => prisma.punch.createMany({ data: batch, skipDuplicates: true }));
  step(`${punchRows.length} punches`);

  await inBatches(leaveRows, 2000, (batch) =>
    prisma.leaveRequest.createMany({
      data: batch.map((l) => ({
        companyId: company.id,
        employeeId: l.employeeId,
        leaveTypeId: lt(l.type),
        startDate: keyToUtcDate(l.start),
        endDate: keyToUtcDate(l.end),
        days: l.days,
        reason: "Scale test leave",
        status: l.approved ? ("APPROVED" as const) : ("PENDING" as const),
        decidedById: l.approved ? hr.id : null,
        decidedAt: l.approved ? new Date() : null,
      })),
    }),
  );
  await inBatches(otRows, 5000, (batch) =>
    prisma.overtimeRequest.createMany({
      data: batch.map((r) => ({
        companyId: company.id,
        employeeId: r.employeeId,
        date: keyToUtcDate(r.day),
        minutes: r.minutes,
        reason: "Extra deliveries / inventory count",
        status: r.approved ? ("APPROVED" as const) : ("PENDING" as const),
        decidedById: r.approved ? hr.id : null,
        decidedAt: r.approved ? new Date() : null,
      })),
    }),
  );
  await prisma.attendanceCorrectionRequest.createMany({
    data: corrections.map((c) => ({
      companyId: company.id,
      employeeId: c.employeeId,
      kind: "MISSING_OUT" as const,
      date: keyToUtcDate(c.day),
      clockOutAt: c.at,
      reason: "Forgot to tap out",
      filedById: c.employeeId,
    })),
  });
  await prisma.scheduleChangeRequest.createMany({
    data: scheduleChanges.map((c) => ({
      companyId: company.id,
      employeeId: c.employeeId,
      kind: "CHANGE" as const,
      shiftId: c.shiftId,
      date: keyToUtcDate(c.day),
      startMinute: 10 * 60,
      durationMinutes: 9 * 60,
      locationId: c.locationId,
      reason: "Medical appointment in the morning",
      filedById: c.employeeId,
    })),
  });
  step(
    `${leaveRows.length} leave, ${otRows.length} overtime, ${corrections.length} correction and ${scheduleChanges.length} schedule-change requests`,
  );

  // Build attendance with the production pairing engine, then raise exceptions.
  const parsed = parseSettings(settings);
  const from = atMinute(addDays(days[0]!, -1), 0, TZ);
  const to = atMinute(addDays(days.at(-1)!, 2), 0, TZ);
  const recent = atMinute(addDays(days.at(-1)!, -13), 0, TZ);
  let done = 0;
  await pool(
    people.filter((p) => p.role !== "OWNER"),
    PARALLEL,
    async (p) => {
      const result = await prisma.$transaction(
        (tx) =>
          rebuildAttendance(tx, {
            companyId: company.id,
            timezone: TZ,
            settings: parsed,
            employeeId: p.id,
            from,
            to,
          }),
        { timeout: 120_000, maxWait: 60_000 },
      );
      await raiseRebuildIssues(company.id, p.id, TZ, result);
      // Detailed checks (late, undertime, long breaks) for the last two weeks, like the live app.
      const entries = await prisma.timeEntry.findMany({
        where: { employeeId: p.id, clockInAt: { gte: recent } },
        select: { id: true },
      });
      for (const e of entries) await detectOnPunch(company.id, p.id, e.id);
      if (++done % 250 === 0) step(`attendance built for ${done} people`);
    },
  );
  const [entries, exceptions] = await Promise.all([
    prisma.timeEntry.count({ where: { companyId: company.id } }),
    prisma.timeException.count({ where: { companyId: company.id } }),
  ]);
  step(`${entries} time entries, ${exceptions} exceptions`);

  if (PAYROLL) await runPayroll(company);

  console.log(`\nDone in ${((Date.now() - t0) / 60_000).toFixed(1)} min.`);
  console.log(
    `Sign in: hr@${DOMAIN} / ${PASSWORD} (also owner@, timekeeper@, supervisor.mnl-hq@, emp00100@ …)`,
  );
}

async function entry() {
  if (args.includes("--payroll-only")) {
    await runPayroll(await prisma.company.findUniqueOrThrow({ where: { slug: SLUG } }));
    return;
  }
  await main();
}

/** Compute the last completed cutoff's payroll for everyone (the 1,000+ person payroll test). */
async function runPayroll(company: Awaited<ReturnType<typeof prisma.company.findUniqueOrThrow>>) {
  const parsed = parseSettings(company.settings);
  const owner = await prisma.employee.findFirstOrThrow({ where: { companyId: company.id, role: "OWNER" } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: owner.userId! } });
  const ctx = {
    user,
    company,
    employee: owner,
    role: "OWNER",
    plan: "ENTERPRISE",
    isManager: true,
    isAdmin: true,
    isHr: true,
    canViewPay: true,
    approves: (k: Approval) => canApprove("OWNER", k),
    managedLocationIds: null,
    managedDepartmentIds: null,
    settings: parsed,
    needsTwoFactor: false,
    db: tenantDb(company.id),
    memberships: [],
    can: (f: Parameters<typeof hasFeature>[1]) => hasFeature("ENTERPRISE", f),
  } as unknown as AppContext;
  const period = previousPayPeriod(
    payPeriodFor(dateKey(new Date(), TZ), "SEMI_MONTHLY", { weekStartsOn: 1, payDateOffsetDays: 5 }),
    "SEMI_MONTHLY",
    { weekStartsOn: 1, payDateOffsetDays: 5 },
  );
  const p0 = Date.now();
  const run = await createPayRun(ctx, period.start);
  await computePayRun(ctx, run.id);
  step(`payroll for ${period.start}–${period.end} computed in ${((Date.now() - p0) / 1000).toFixed(1)}s`);
}

entry()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

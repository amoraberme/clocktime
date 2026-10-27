/**
 * Seeds "Demo Logistics Corp", a nationwide Enterprise demo: four regions and branches, office
 * staff on fingerprint terminals, a night warehouse crew, 24-hour security guards on RFID cards,
 * drivers and sales reps punching by phone (some offline), and a cutoff's worth of attendance
 * with the cases HR asks about: lateness, undertime, approved and pending overtime, leave, an
 * absence, a missing clock-out, a 30-hour duty, a mid-cutoff schedule change and a fingerprint +
 * phone double tap. Punches go through the real pairing engine.
 *
 * Run: pnpm demo:enterprise   (re-running replaces the demo company)
 * Sign in: hr@logistics.demo.clocktime.ph / demo12345 (also owner@, timekeeper@, supervisor.cebu@)
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { PunchAction, PunchSource, Role } from "../src/generated/prisma/enums";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import {
  addDays,
  atMinute,
  eachDay,
  keyToUtcDate,
  payPeriodFor,
  previousPayPeriod,
  weekday,
} from "../src/lib/time";
import { cardLookup, encrypt, hashSecret, pinLookup } from "../src/server/crypto";
import { prisma } from "../src/server/db";
import { rebuildAttendance } from "../src/server/services/attendance/rebuild";
import { detectOnPunch, raiseRebuildIssues } from "../src/server/services/exceptions";
import { DEFAULT_LEAVE_TYPES } from "../src/server/services/company";

const TZ = "Asia/Manila";
const SLUG = "demo-logistics";
const DOMAIN = "logistics.demo.clocktime.ph";
const PASSWORD = "demo12345";

// Deterministic randomness so the sample report is the same on every run.
let seed = 20261015;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));

const REGIONS = [
  { key: "NCR", name: "NCR", code: "NCR" },
  { key: "CL", name: "Central Luzon", code: "CL" },
  { key: "VIS", name: "Visayas", code: "VIS" },
  { key: "MIN", name: "Mindanao", code: "MIN" },
];
const BRANCHES = [
  { key: "MNL", name: "Manila HQ", code: "MNL-HQ", region: "NCR", lat: 14.5547, lng: 121.0244 },
  { key: "CRK", name: "Clark Hub", code: "CRK-01", region: "CL", lat: 15.1858, lng: 120.56 },
  { key: "CEB", name: "Cebu Depot", code: "CEB-01", region: "VIS", lat: 10.3157, lng: 123.8854 },
  { key: "DVO", name: "Davao Depot", code: "DVO-01", region: "MIN", lat: 7.0731, lng: 125.6128 },
];

type Kind = "admin" | "office" | "kiosk" | "night" | "guard" | "driver" | "sales";
type Person = {
  first: string;
  last: string;
  kind: Kind;
  branch: string;
  dept: string;
  role?: Role;
  email?: string;
  rate: number;
  payType?: "DAILY" | "MONTHLY";
};

const PEOPLE: Person[] = [
  {
    first: "Andrea",
    last: "Lim",
    kind: "admin",
    branch: "MNL",
    dept: "Admin",
    role: "OWNER",
    email: "owner",
    rate: 85000,
    payType: "MONTHLY",
  },
  {
    first: "Bea",
    last: "Santos",
    kind: "admin",
    branch: "MNL",
    dept: "Admin",
    role: "HR",
    email: "hr",
    rate: 45000,
    payType: "MONTHLY",
  },
  {
    first: "Carlo",
    last: "Reyes",
    kind: "office",
    branch: "MNL",
    dept: "Admin",
    role: "TIMEKEEPER",
    email: "timekeeper",
    rate: 780,
  },
  { first: "Maria", last: "Dela Cruz", kind: "office", branch: "MNL", dept: "Operations", rate: 695 },
  { first: "Jun", last: "Mendoza", kind: "office", branch: "MNL", dept: "Operations", rate: 695 },
  { first: "Liza", last: "Garcia", kind: "office", branch: "MNL", dept: "Operations", rate: 720 },
  { first: "Rico", last: "Bautista", kind: "night", branch: "CRK", dept: "Warehouse", rate: 610 },
  { first: "Nestor", last: "Aquino", kind: "night", branch: "CRK", dept: "Warehouse", rate: 610 },
  { first: "Joy", last: "Pascual", kind: "night", branch: "CRK", dept: "Warehouse", rate: 610 },
  { first: "Dennis", last: "Flores", kind: "guard", branch: "CEB", dept: "Security", rate: 580 },
  { first: "Ramon", last: "Villanueva", kind: "guard", branch: "CEB", dept: "Security", rate: 580 },
  { first: "Edwin", last: "Castro", kind: "guard", branch: "DVO", dept: "Security", rate: 560 },
  { first: "Lito", last: "Ramos", kind: "guard", branch: "DVO", dept: "Security", rate: 560 },
  {
    first: "Grace",
    last: "Torres",
    kind: "kiosk",
    branch: "CEB",
    dept: "Operations",
    role: "MANAGER",
    email: "supervisor.cebu",
    rate: 650,
  },
  { first: "Paolo", last: "Navarro", kind: "kiosk", branch: "CEB", dept: "Operations", rate: 540 },
  { first: "Ana", last: "Salazar", kind: "kiosk", branch: "DVO", dept: "Operations", rate: 530 },
  { first: "Mark", last: "Ocampo", kind: "driver", branch: "MNL", dept: "Operations", rate: 700 },
  { first: "Jomar", last: "Lopez", kind: "driver", branch: "CRK", dept: "Operations", rate: 620 },
  { first: "Ben", last: "Rivera", kind: "driver", branch: "CEB", dept: "Operations", rate: 560 },
  { first: "Kris", last: "Manalo", kind: "sales", branch: "MNL", dept: "Sales", rate: 750 },
  { first: "Tess", last: "Aguilar", kind: "sales", branch: "CEB", dept: "Sales", rate: 600 },
  { first: "Vince", last: "Dizon", kind: "sales", branch: "DVO", dept: "Sales", rate: 590 },
];

async function user(name: string, email: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const id = randomUUID();
  const u = await prisma.user.create({ data: { id, name, email, emailVerified: true } });
  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(PASSWORD),
    },
  });
  return u;
}

type PunchSpec = {
  action: PunchAction;
  at: Date;
  source: PunchSource;
  method: string;
  offline?: boolean;
  gps?: { lat: number; lng: number };
  duplicateOf?: string;
};

async function main() {
  const existing = await prisma.company.findUnique({ where: { slug: SLUG } });
  if (existing) await prisma.company.delete({ where: { id: existing.id } });

  const today = new Date().toISOString().slice(0, 10);
  const period = previousPayPeriod(
    payPeriodFor(today, "SEMI_MONTHLY", { weekStartsOn: 1, payDateOffsetDays: 5 }),
    "SEMI_MONTHLY",
    {
      weekStartsOn: 1,
      payDateOffsetDays: 5,
    },
  );
  const days = eachDay(period.start, period.end);

  const ownerUser = await user("Andrea Lim", `owner@${DOMAIN}`);
  const company = await prisma.company.create({
    data: {
      name: "Demo Logistics Corp",
      slug: SLUG,
      joinCode: "LOGI2026",
      industry: "Logistics",
      timezone: TZ,
      payFrequency: "SEMI_MONTHLY",
      settings: { ...DEFAULT_SETTINGS, maxShiftHours: 24, duplicatePunchMinutes: 3 },
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

  const regions = new Map<string, string>();
  for (const r of REGIONS)
    regions.set(
      r.key,
      (await prisma.region.create({ data: { companyId: company.id, name: r.name, code: r.code } })).id,
    );
  const branches = new Map<string, (typeof BRANCHES)[number] & { id: string }>();
  for (const b of BRANCHES) {
    const loc = await prisma.location.create({
      data: {
        companyId: company.id,
        name: b.name,
        code: b.code,
        regionId: regions.get(b.region)!,
        latitude: b.lat,
        longitude: b.lng,
        radiusMeters: 200,
        geofenceMode: "WARN",
      },
    });
    branches.set(b.key, { ...b, id: loc.id });
  }
  const departments = new Map<string, string>();
  for (const d of ["Admin", "Operations", "Warehouse", "Security", "Sales"])
    departments.set(d, (await prisma.department.create({ data: { companyId: company.id, name: d } })).id);

  // A local special holiday mid-cutoff so the report shows holiday handling.
  const holidayDay = days[8]!;
  await prisma.holiday.create({
    data: {
      companyId: company.id,
      date: keyToUtcDate(holidayDay),
      name: "Local special holiday (sample)",
      type: "SPECIAL_NON_WORKING",
    },
  });

  const employees: (Person & { id: string; restDays: number[] })[] = [];
  let no = 0;
  for (const p of PEOPLE) {
    no++;
    const employeeNo = String(no).padStart(4, "0");
    const restDays =
      p.kind === "guard"
        ? []
        : p.kind === "office" || p.kind === "sales" || p.kind === "admin"
          ? [0, 6]
          : [0];
    const u = p.email
      ? p.role === "OWNER"
        ? ownerUser
        : await user(`${p.first} ${p.last}`, `${p.email}@${DOMAIN}`)
      : null;
    const card = p.kind === "guard" || p.kind === "kiosk" ? String(4_100_000 + no * 137) : null;
    const pin = p.kind === "kiosk" ? `20${employeeNo.slice(2)}` : null;
    const e = await prisma.employee.create({
      data: {
        companyId: company.id,
        userId: u?.id ?? null,
        firstName: p.first,
        lastName: p.last,
        email: u?.email ?? null,
        employeeNo,
        deviceUserId: String(no),
        cardEnc: card ? encrypt(card) : null,
        cardLookup: card ? cardLookup(company.id, card) : null,
        pinHash: pin ? await hashSecret(pin) : null,
        pinLookup: pin ? pinLookup(company.id, pin) : null,
        role: p.role ?? "EMPLOYEE",
        status: "ACTIVE",
        payType: p.payType ?? "DAILY",
        rateCentavos: p.rate * 100,
        workDaysPerYear: p.kind === "guard" ? 365 : 313,
        timeExempt: p.kind === "admin",
        restDays,
        fieldWork: p.kind === "driver" || p.kind === "sales",
        roaming: p.kind === "driver",
        hireDate: keyToUtcDate("2024-03-01"),
        departmentId: departments.get(p.dept)!,
        biometricConsentAt: new Date(),
        locationConsentAt: new Date(),
        locations: { create: [{ locationId: branches.get(p.branch)!.id }] },
      },
    });
    if (u) await prisma.user.update({ where: { id: u.id }, data: { activeCompanyId: company.id } });
    employees.push({ ...p, id: e.id, restDays });
  }
  const byName = (first: string) => employees.find((e) => e.first === first)!;
  // The Cebu supervisor manages Operations at the Cebu branch only.
  await prisma.employeeDepartment.create({
    data: { employeeId: byName("Grace").id, departmentId: departments.get("Operations")! },
  });

  const shiftsFor = (e: (typeof employees)[number]) => {
    const out: { start: Date; end: Date }[] = [];
    const guardIndex = employees.filter((x) => x.kind === "guard").indexOf(e);
    days.forEach((day, i) => {
      const wd = weekday(day);
      const at = (min: number) => atMinute(day, min, TZ);
      switch (e.kind) {
        case "office":
        case "sales":
          if (wd !== 0 && wd !== 6 && day !== holidayDay) out.push({ start: at(8 * 60), end: at(17 * 60) });
          break;
        case "kiosk":
          if (wd !== 0) out.push({ start: at(9 * 60), end: at(18 * 60) });
          break;
        case "night":
          // Rico is moved to the day shift for days 6–10 of the cutoff (a mid-cutoff schedule change).
          if (wd === 0) break;
          if (e.first === "Rico" && i >= 5 && i <= 9) out.push({ start: at(8 * 60), end: at(17 * 60) });
          else out.push({ start: at(22 * 60), end: at(30 * 60) });
          break;
        case "guard":
          // 24 hours on, 48 off, staggered per guard.
          if ((i + guardIndex) % 3 === 0) out.push({ start: at(8 * 60), end: at(32 * 60) });
          break;
        case "driver":
          if (wd !== 0) out.push({ start: at(6 * 60), end: at(15 * 60) });
          break;
      }
    });
    return out;
  };

  const minutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
  for (const e of employees) {
    if (e.kind === "admin") continue;
    const branch = branches.get(e.branch)!;
    const shifts = shiftsFor(e);
    for (const s of shifts)
      await prisma.shift.create({
        data: {
          companyId: company.id,
          employeeId: e.id,
          locationId: branch.id,
          startAt: s.start,
          endAt: s.end,
          breakMinutes: e.kind === "guard" ? 60 : 60,
          status: "PUBLISHED",
          publishedAt: new Date(),
          confirmedAt: new Date(),
        },
      });

    const punches: PunchSpec[] = [];
    const gps = { lat: branch.lat + (rand() - 0.5) * 0.02, lng: branch.lng + (rand() - 0.5) * 0.02 };
    shifts.forEach((s, i) => {
      // Leave and absence scenarios
      if (e.first === "Maria" && i === 3) return; // absent, no leave filed
      if (e.first === "Jun" && (i === 4 || i === 5)) return; // vacation leave
      if (e.first === "Kris" && i === 2) return; // sick leave
      if (e.first === "Tess" && i === 6) return; // unpaid leave
      const late = rand() < 0.18 ? between(8, 40) : between(-15, 3);
      const inAt = minutes(s.start, late);
      let outAt = minutes(s.end, rand() < 0.1 ? between(-45, -10) : between(0, 15));
      let otApproved: boolean | null = null;
      if (rand() < 0.22 && e.kind !== "guard") {
        outAt = minutes(s.end, between(60, 180));
        otApproved = rand() < 0.65;
      }
      if (e.first === "Ramon" && i === 1) {
        outAt = minutes(s.end, 6 * 60); // 30-hour duty, waits for HR review
        otApproved = null;
      }
      const missingOut = (e.first === "Dennis" && i === 1) || (e.first === "Mark" && i === 4);

      switch (e.kind) {
        case "office": {
          const lunch = minutes(s.start, 4 * 60 + between(-5, 10));
          punches.push({ action: "TOGGLE", at: inAt, source: "BIOMETRIC", method: "FINGERPRINT" });
          punches.push({ action: "TOGGLE", at: lunch, source: "BIOMETRIC", method: "FINGERPRINT" });
          punches.push({
            action: "TOGGLE",
            at: minutes(lunch, between(50, 70)),
            source: "BIOMETRIC",
            method: "FINGERPRINT",
          });
          punches.push({ action: "TOGGLE", at: outAt, source: "BIOMETRIC", method: "FINGERPRINT" });
          if (e.first === "Liza" && i === 1)
            punches.push({
              action: "CLOCK_IN",
              at: minutes(inAt, 1),
              source: "MOBILE",
              method: "GPS",
              gps,
              duplicateOf: "prev-in",
            });
          break;
        }
        case "night":
          punches.push({ action: "TOGGLE", at: inAt, source: "BIOMETRIC", method: "FINGERPRINT" });
          punches.push({ action: "TOGGLE", at: outAt, source: "BIOMETRIC", method: "FINGERPRINT" });
          break;
        case "guard":
          punches.push({ action: "TOGGLE", at: inAt, source: "BIOMETRIC", method: "CARD" });
          if (!missingOut) punches.push({ action: "TOGGLE", at: outAt, source: "BIOMETRIC", method: "CARD" });
          break;
        case "kiosk":
          punches.push({ action: "CLOCK_IN", at: inAt, source: "KIOSK", method: "PIN" });
          punches.push({ action: "CLOCK_OUT", at: outAt, source: "KIOSK", method: "PIN" });
          break;
        case "driver":
        case "sales": {
          const offline = e.first === "Jomar" && i % 3 === 0;
          const where = { lat: gps.lat + (rand() - 0.5) * 0.3, lng: gps.lng + (rand() - 0.5) * 0.3 };
          punches.push({
            action: "CLOCK_IN",
            at: inAt,
            source: "MOBILE",
            method: "GPS",
            gps: where,
            offline,
          });
          if (!missingOut)
            punches.push({
              action: "CLOCK_OUT",
              at: outAt,
              source: "MOBILE",
              method: "GPS",
              gps: where,
              offline,
            });
          break;
        }
      }
      if (e.kind === "guard") {
        // Rostered 24-hour duties: the 16 hours past the regular 8 are pre-approved overtime.
        // Anything beyond the roster (Ramon's 30-hour duty) waits for HR.
        otRequests.push({ employeeId: e.id, day: dayKeyOf(s.start), minutes: 16 * 60, approved: true });
      } else if (otApproved !== null) {
        const ot = Math.round((outAt.getTime() - s.end.getTime()) / 60_000);
        if (ot >= 30)
          otRequests.push({ employeeId: e.id, day: dayKeyOf(s.start), minutes: ot, approved: otApproved });
      }
    });

    let lastTapId: string | null = null;
    let n = 0;
    for (const p of punches) {
      const row: { id: string } = await prisma.punch.create({
        data: {
          companyId: company.id,
          employeeId: e.id,
          clientId: `demo:${e.id}:${n++}`,
          action: p.action,
          at: p.at,
          receivedAt: p.offline ? minutes(p.at, 180) : p.at,
          source: p.source,
          method: p.method,
          lat: p.gps?.lat ?? null,
          lng: p.gps?.lng ?? null,
          accuracy: p.gps ? between(5, 40) : null,
          locationId: branch.id,
          offline: !!p.offline || p.source === "BIOMETRIC",
          accepted: true,
          duplicateOfId: p.duplicateOf ? lastTapId : null,
        },
      });
      if (p.action === "TOGGLE") lastTapId = row.id;
    }
  }

  // Leave
  const leave = async (first: string, code: string, shiftIndexes: number[]) => {
    const e = byName(first);
    const s = shiftsFor(e);
    const start = dayKeyOf(s[shiftIndexes[0]!]!.start);
    const end = dayKeyOf(s[shiftIndexes[shiftIndexes.length - 1]!]!.start);
    await prisma.leaveRequest.create({
      data: {
        companyId: company.id,
        employeeId: e.id,
        leaveTypeId: lt(code),
        startDate: keyToUtcDate(start),
        endDate: keyToUtcDate(end),
        days: shiftIndexes.length,
        reason: "Sample leave",
        status: "APPROVED",
        decidedById: byName("Bea").id,
        decidedAt: new Date(),
      },
    });
  };
  await leave("Jun", "VL", [4, 5]);
  await leave("Kris", "SL", [2]);
  await leave("Tess", "UL", [6]);

  for (const r of otRequests)
    await prisma.overtimeRequest.create({
      data: {
        companyId: company.id,
        employeeId: r.employeeId,
        date: keyToUtcDate(r.day),
        minutes: r.minutes,
        reason: "Extra deliveries / inventory count",
        status: r.approved ? "APPROVED" : "PENDING",
        decidedById: r.approved ? byName("Bea").id : null,
        decidedAt: r.approved ? new Date() : null,
      },
    });

  // Pair everyone's punches with the real engine, then run the exception detectors.
  const settings = { ...DEFAULT_SETTINGS, maxShiftHours: 24 };
  for (const e of employees) {
    const result = await prisma.$transaction(
      (tx) =>
        rebuildAttendance(tx, {
          companyId: company.id,
          timezone: TZ,
          settings,
          employeeId: e.id,
          from: atMinute(addDays(period.start, -1), 0, TZ),
          to: atMinute(addDays(period.end, 2), 0, TZ),
        }),
      { timeout: 60_000 },
    );
    await raiseRebuildIssues(company.id, e.id, TZ, result);
    for (const id of result.entryIds) await detectOnPunch(company.id, e.id, id);
  }
  await prisma.auditLog.create({
    data: {
      companyId: company.id,
      actorLabel: "Bea Santos (HR)",
      action: "shift.update",
      entityType: "Shift",
      after: { note: "Rico Bautista moved from night to day shift for 5 days (mid-cutoff schedule change)" },
    },
  });
  const entries = await prisma.timeEntry.count({ where: { companyId: company.id } });
  console.log(
    `Seeded ${company.name}: ${employees.length} people, ${entries} time entries, cutoff ${period.start}–${period.end}`,
  );
  console.log(`Sign in as hr@${DOMAIN} / ${PASSWORD}`);
}

const otRequests: { employeeId: string; day: string; minutes: number; approved: boolean }[] = [];
function dayKeyOf(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

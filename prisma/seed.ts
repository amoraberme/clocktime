/**
 * Seeds statutory tables, national holidays and (outside production) a demo company.
 * Idempotent: safe to run repeatedly.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { fixedHolidaysFor, PH_HOLIDAYS_2026 } from "../src/lib/pay/holidays-ph";
import { PREMIUMS_DOLE } from "../src/lib/pay/premiums";
import { PAGIBIG_2024, PHILHEALTH_2025, SSS_2025, WITHHOLDING_2023 } from "../src/lib/pay/statutory";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { addDays, atMinute, dateKey, keyToUtcDate, startOfWeek, weekday } from "../src/lib/time";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const TZ = "Asia/Manila";

async function seedStatutory() {
  const tables = [
    {
      kind: "SSS",
      effectiveFrom: "2025-01-01",
      version: "SSS 2025 (15%, MSC ₱5k–₱35k)",
      data: SSS_2025,
      source: "SSS Circular 2024-006",
    },
    {
      kind: "PHILHEALTH",
      effectiveFrom: "2025-01-01",
      version: "PhilHealth 2025 (5%)",
      data: PHILHEALTH_2025,
      source: "PhilHealth Circular 2020-0005",
    },
    {
      kind: "PAGIBIG",
      effectiveFrom: "2024-02-01",
      version: "Pag-IBIG 2024 (2%, ₱10k MFS)",
      data: PAGIBIG_2024,
      source: "HDMF Circular 460",
    },
    {
      kind: "WITHHOLDING_TAX",
      effectiveFrom: "2023-01-01",
      version: "BIR TRAIN table 2023",
      data: WITHHOLDING_2023,
      source: "RR 11-2018 Annex E",
    },
    {
      kind: "PREMIUMS",
      effectiveFrom: "2018-01-01",
      version: "DOLE premium pay rules",
      data: PREMIUMS_DOLE,
      source: "Labor Code arts. 86–94",
    },
  ] as const;
  for (const t of tables) {
    await prisma.statutoryTable.upsert({
      where: { kind_effectiveFrom: { kind: t.kind, effectiveFrom: keyToUtcDate(t.effectiveFrom) } },
      create: {
        kind: t.kind,
        effectiveFrom: keyToUtcDate(t.effectiveFrom),
        version: t.version,
        data: t.data,
        source: t.source,
      },
      update: { version: t.version, data: t.data, source: t.source },
    });
  }
}

async function seedHolidays() {
  const all = [...PH_HOLIDAYS_2026, ...fixedHolidaysFor(2027)];
  for (const h of all) {
    const existing = await prisma.holiday.findFirst({
      where: { companyId: null, date: keyToUtcDate(h.date), name: h.name },
    });
    if (!existing)
      await prisma.holiday.create({ data: { date: keyToUtcDate(h.date), name: h.name, type: h.type } });
  }
}

async function createUser(name: string, email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const id = randomUUID();
  const user = await prisma.user.create({ data: { id, name, email, emailVerified: true } });
  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(password),
    },
  });
  return user;
}

async function seedDemo() {
  if (await prisma.company.findUnique({ where: { slug: "demo-kape-kanto" } })) return;
  const owner = await createUser("Maria Santos", "owner@demo.clocktime.ph", "demo12345");
  const company = await prisma.company.create({
    data: {
      name: "Kape Kanto Café",
      slug: "demo-kape-kanto",
      joinCode: "DEMO2026",
      industry: "Restaurant / Café",
      payFrequency: "SEMI_MONTHLY",
      settings: DEFAULT_SETTINGS,
      plan: "PRO",
      planStatus: "ACTIVE",
      paidThrough: new Date(Date.now() + 365 * 86_400_000),
      onboardedAt: new Date(),
    },
  });
  await prisma.user.update({ where: { id: owner.id }, data: { activeCompanyId: company.id } });
  const [main, bgc] = await Promise.all([
    prisma.location.create({
      data: {
        companyId: company.id,
        name: "Maginhawa branch",
        address: "Maginhawa St, Teachers Village, Quezon City",
        latitude: 14.6417,
        longitude: 121.0577,
        radiusMeters: 150,
        geofenceMode: "WARN",
      },
    }),
    prisma.location.create({
      data: {
        companyId: company.id,
        name: "BGC kiosk",
        address: "High Street, Bonifacio Global City, Taguig",
        latitude: 14.5509,
        longitude: 121.0509,
        radiusMeters: 120,
        geofenceMode: "BLOCK",
      },
    }),
  ]);
  const position = (name: string, color: string) =>
    prisma.position.create({ data: { companyId: company.id, name, color } });
  const barista = await position("Barista", "#0ea5e9");
  const cashier = await position("Cashier", "#f59e0b");
  const kitchen = await position("Kitchen", "#10b981");
  const ops = await prisma.department.create({ data: { companyId: company.id, name: "Operations" } });
  await prisma.leaveType.createMany({
    data: [
      {
        companyId: company.id,
        code: "SIL",
        name: "Service Incentive Leave",
        paid: true,
        annualDays: 5,
        isSil: true,
      },
      { companyId: company.id, code: "VL", name: "Vacation leave", paid: true, annualDays: 5 },
      { companyId: company.id, code: "SL", name: "Sick leave", paid: true, annualDays: 5 },
      { companyId: company.id, code: "UL", name: "Unpaid leave", paid: false },
    ],
  });

  const people = [
    {
      first: "Maria",
      last: "Santos",
      role: "OWNER",
      payType: "MONTHLY",
      rate: 45_000_00,
      pos: null,
      loc: [main.id, bgc.id],
      userId: owner.id,
      color: "#0f766e",
    },
    {
      first: "Jose",
      last: "Reyes",
      role: "MANAGER",
      payType: "MONTHLY",
      rate: 28_000_00,
      pos: barista.id,
      loc: [main.id],
      color: "#8b5cf6",
    },
    {
      first: "Ana",
      last: "Cruz",
      role: "EMPLOYEE",
      payType: "DAILY",
      rate: 695_00,
      pos: barista.id,
      loc: [main.id],
      color: "#ec4899",
      mwe: true,
    },
    {
      first: "Mark",
      last: "Bautista",
      role: "EMPLOYEE",
      payType: "DAILY",
      rate: 750_00,
      pos: kitchen.id,
      loc: [main.id],
      color: "#f97316",
    },
    {
      first: "Liza",
      last: "Garcia",
      role: "EMPLOYEE",
      payType: "DAILY",
      rate: 695_00,
      pos: cashier.id,
      loc: [main.id],
      color: "#10b981",
      mwe: true,
    },
    {
      first: "Paolo",
      last: "Mendoza",
      role: "EMPLOYEE",
      payType: "HOURLY",
      rate: 95_00,
      pos: barista.id,
      loc: [bgc.id],
      color: "#eab308",
    },
    {
      first: "Grace",
      last: "Villanueva",
      role: "EMPLOYEE",
      payType: "DAILY",
      rate: 720_00,
      pos: cashier.id,
      loc: [bgc.id],
      color: "#6366f1",
    },
  ] as const;

  const employees = [];
  let n = 1;
  for (const p of people) {
    const user =
      "userId" in p
        ? owner
        : await createUser(`${p.first} ${p.last}`, `${p.first.toLowerCase()}@demo.clocktime.ph`, "demo12345");
    employees.push(
      await prisma.employee.create({
        data: {
          companyId: company.id,
          userId: user.id,
          firstName: p.first,
          lastName: p.last,
          email: user.email,
          employeeNo: String(n++).padStart(4, "0"),
          role: p.role,
          status: "ACTIVE",
          payType: p.payType,
          rateCentavos: p.rate,
          isMinimumWageEarner: "mwe" in p,
          hireDate: keyToUtcDate("2024-06-01"),
          restDays: [0],
          color: p.color,
          positionId: p.pos,
          departmentId: ops.id,
          locations: { create: p.loc.map((locationId) => ({ locationId })) },
        },
      }),
    );
  }

  // Shifts: last 3 weeks + this week + next week, Mon–Sat, 7:00–16:00 or 12:00–21:00.
  const today = dateKey(new Date(), TZ);
  const firstDay = startOfWeek(addDays(today, -21), 1);
  const staff = employees.slice(1);
  for (let k = firstDay; k <= addDays(startOfWeek(today, 1), 13); k = addDays(k, 1)) {
    if (weekday(k) === 0) continue;
    for (const [i, e] of staff.entries()) {
      const late = (i + Number(k.slice(-2))) % 2 === 0;
      const startMinute = late ? 12 * 60 : 7 * 60;
      const locationId = people[i + 1]!.loc[0]!;
      const startAt = atMinute(k, startMinute, TZ);
      const endAt = atMinute(k, startMinute + 9 * 60, TZ);
      const past = k < today;
      const shift = await prisma.shift.create({
        data: {
          companyId: company.id,
          locationId,
          employeeId: e.id,
          positionId: e.positionId,
          startAt,
          endAt,
          breakMinutes: 60,
          status: "PUBLISHED",
          publishedAt: new Date(),
          confirmedAt: past ? startAt : null,
        },
      });
      if (!past) continue;
      // Realistic punches: small jitter, occasional lateness and overtime.
      const jitterIn = ((i * 7 + Number(k.slice(-2)) * 3) % 13) - 6;
      const jitterOut = ((i * 5 + Number(k.slice(-2)) * 11) % 50) - 5;
      const loc = locationId === main.id ? main : bgc;
      const inAt = new Date(startAt.getTime() + jitterIn * 60000);
      const outAt = new Date(endAt.getTime() + jitterOut * 60000);
      const lunch = new Date(startAt.getTime() + 4 * 3600_000);
      await prisma.timeEntry.create({
        data: {
          companyId: company.id,
          employeeId: e.id,
          locationId,
          shiftId: shift.id,
          clockInAt: inAt,
          clockOutAt: outAt,
          inLat: loc.latitude! + 0.0002,
          inLng: loc.longitude! - 0.0001,
          inAccuracy: 12,
          outLat: loc.latitude! + 0.0001,
          outLng: loc.longitude! + 0.0001,
          outAccuracy: 15,
          inSource: i % 3 === 0 ? "KIOSK" : "MOBILE",
          outSource: i % 3 === 0 ? "KIOSK" : "MOBILE",
          status: "CLOSED",
          breaks: { create: [{ startAt: lunch, endAt: new Date(lunch.getTime() + 60 * 60000) }] },
        },
      });
    }
  }
  // Two people currently on the clock today.
  for (const e of staff.slice(0, 2)) {
    const shift = await prisma.shift.findFirst({
      where: { employeeId: e.id, startAt: { gte: atMinute(today, 0, TZ) } },
      orderBy: { startAt: "asc" },
    });
    await prisma.timeEntry.create({
      data: {
        companyId: company.id,
        employeeId: e.id,
        locationId: main.id,
        shiftId: shift?.id,
        clockInAt: new Date(Date.now() - 3 * 3600_000),
        inLat: main.latitude,
        inLng: main.longitude,
        inAccuracy: 10,
        inSource: "MOBILE",
        status: "OPEN",
      },
    });
  }
  console.log(
    `Demo company created. Sign in as owner@demo.clocktime.ph / demo12345 (staff: ana@demo.clocktime.ph …)`,
  );
}

async function main() {
  await seedStatutory();
  await seedHolidays();
  if (process.env.NODE_ENV !== "production" || process.env.SEED_DEMO === "1") await seedDemo();
  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

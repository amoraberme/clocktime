import "server-only";
import { randomUUID } from "node:crypto";
import { PLANS } from "@/config/plans";
import type { Prisma } from "@/generated/prisma/client";
import { canAddSeat, effectivePlan } from "@/lib/entitlements";
import { pesosToCentavos } from "@/lib/money";
import { keyToUtcDate } from "@/lib/time";
import { normalizeCard, normalizeUserId } from "@/lib/identifiers";
import { fullName } from "@/lib/utils";
import {
  csvRowToInput,
  employeeInputSchema,
  maxImportRows,
  type EmployeeInput,
} from "@/lib/validation/employee";
import { UserError } from "../action";
import { actorFrom, writeAudit } from "../audit";
import type { AppContext } from "../context";
import { cardLookup, encrypt, hashSecret, pinLookup, randomToken, sha256 } from "../crypto";
import { prisma } from "../db";
import { assertEmployeeInScope } from "../scope";
import { escapeHtml, layout, sendEmail } from "../email";
import { activeSeatCount, splitName } from "./company";
import { queueRosterSync } from "./terminals";
import { emitEvent } from "./webhooks";

const PALETTE = [
  "#0ea5e9",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#10b981",
  "#eab308",
  "#6366f1",
  "#14b8a6",
  "#ef4444",
  "#84cc16",
];

async function nextEmployeeNo(companyId: string) {
  const rows = await prisma.employee.findMany({ where: { companyId }, select: { employeeNo: true } });
  const max = rows.reduce((m, r) => Math.max(m, Number.parseInt(r.employeeNo ?? "0", 10) || 0), 0);
  return String(max + 1).padStart(4, "0");
}

async function ensureSeat(ctx: AppContext, adding = 1) {
  const seats = await activeSeatCount(ctx.company.id);
  if (!canAddSeat(ctx.plan, seats + adding - 1)) {
    throw new UserError(
      `The ${PLANS[ctx.plan].name} plan allows ${PLANS[ctx.plan].maxSeats} people. Upgrade to add more of your team.`,
    );
  }
}

async function resolveNamed(companyId: string, model: "department" | "position", name?: string) {
  if (!name) return null;
  const where = { companyId_name: { companyId, name } };
  const row =
    model === "department"
      ? await prisma.department.upsert({ where, create: { companyId, name }, update: {} })
      : await prisma.position.upsert({ where, create: { companyId, name }, update: {} });
  return row.id;
}

function employeeData(input: EmployeeInput) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    role: input.role,
    payType: input.payType,
    rateCentavos: pesosToCentavos(input.rate),
    workDaysPerYear: input.workDaysPerYear,
    isMinimumWageEarner: input.isMinimumWageEarner,
    timeExempt: input.timeExempt,
    restDays: input.restDays,
    hireDate: input.hireDate ? keyToUtcDate(input.hireDate) : null,
    bankName: input.bankName ?? null,
  } satisfies Partial<Prisma.EmployeeUncheckedCreateInput>;
}

function sensitiveData(input: EmployeeInput) {
  const out: Record<string, string | null> = {};
  if (input.tin !== undefined) out.tinEnc = encrypt(input.tin);
  if (input.sss !== undefined) out.sssEnc = encrypt(input.sss);
  if (input.philhealth !== undefined) out.philhealthEnc = encrypt(input.philhealth);
  if (input.pagibig !== undefined) out.pagibigEnc = encrypt(input.pagibig);
  if (input.bankAccount !== undefined) out.bankAccountEnc = encrypt(input.bankAccount);
  return out;
}

/**
 * Terminal user ID, RFID card and field/roaming flags. Each is ignored unless the plan includes it,
 * and IDs must be unique within the company so every badge maps to exactly one person.
 */
async function attendanceData(ctx: AppContext, input: EmployeeInput, employeeId?: string) {
  const out: Record<string, string | boolean | null> = {};
  const others = employeeId ? { id: { not: employeeId } } : {};
  if (ctx.can("biometricDevices")) {
    const userId = input.deviceUserId ? normalizeUserId(input.deviceUserId) : null;
    if (userId) {
      const taken = await ctx.db.employee.findFirst({ where: { deviceUserId: userId, ...others } });
      if (taken) throw new UserError(`Terminal ID ${userId} is already used by ${fullName(taken)}.`);
    }
    out.deviceUserId = userId;
  }
  if (ctx.can("rfid")) {
    if (input.cardNumber) {
      const card = normalizeCard(input.cardNumber);
      const lookup = cardLookup(ctx.company.id, card);
      const taken = await ctx.db.employee.findFirst({ where: { cardLookup: lookup, ...others } });
      if (taken) throw new UserError(`That card is already assigned to ${fullName(taken)}.`);
      out.cardEnc = encrypt(card);
      out.cardLookup = lookup;
    } else if (input.clearCard) {
      out.cardEnc = null;
      out.cardLookup = null;
    }
  }
  if (ctx.can("fieldMode")) {
    out.fieldWork = input.fieldWork;
    out.roaming = input.roaming;
  }
  return out;
}

/** Departments a supervisor manages; only existing departments count. */
async function managedDepartmentIds(ctx: AppContext, input: EmployeeInput) {
  if (input.role === "EMPLOYEE" || input.role === "ADMIN" || input.managedDepartmentNames.length === 0)
    return [];
  const rows = await ctx.db.department.findMany({
    where: { name: { in: input.managedDepartmentNames } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * After someone is added, changed or archived: notify webhooks and push their name, ID and card to
 * their branches' terminals. Never fails the edit.
 */
async function syncTerminals(ctx: AppContext, employeeId: string) {
  if (ctx.can("webhooks")) {
    const e = await ctx.db.employee.findUnique({ where: { id: employeeId } });
    if (e)
      await emitEvent(ctx.company.id, "employee.updated", {
        employeeId: e.id,
        employeeNo: e.employeeNo,
        firstName: e.firstName,
        lastName: e.lastName,
        status: e.status,
        role: e.role,
      });
  }
  if (!ctx.can("biometricDevices")) return;
  await queueRosterSync(ctx.company.id, [employeeId]).catch((err) =>
    console.error("roster sync failed", err),
  );
}

async function validLocationIds(ctx: AppContext, ids: string[]) {
  if (ids.length === 0) {
    const first = await ctx.db.location.findFirst({
      where: { archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return first ? [first.id] : [];
  }
  const rows = await ctx.db.location.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Admins assign any role; HR assigns supervisors and timekeepers. HR/timekeeper roles need Enterprise. */
function assertCanAssignRole(ctx: AppContext, role: EmployeeInput["role"]) {
  if ((role === "HR" || role === "TIMEKEEPER") && !ctx.can("hrRoles"))
    throw new UserError("HR and timekeeper roles need the Enterprise plan.");
  if (role === "EMPLOYEE" || ctx.isAdmin) return;
  if (ctx.isHr && (role === "MANAGER" || role === "TIMEKEEPER")) return;
  throw new UserError("Only owners and admins can add managers or admins.");
}

export async function addEmployee(ctx: AppContext, raw: unknown, opts: { sendInvite?: boolean } = {}) {
  if (!ctx.canViewPay) throw new UserError("Ask HR or an admin to add people.");
  const input = employeeInputSchema.parse(raw);
  assertCanAssignRole(ctx, input.role);
  await ensureSeat(ctx);
  if (input.email) {
    const dupe = await ctx.db.employee.findFirst({
      where: { email: input.email, status: { not: "ARCHIVED" } },
    });
    if (dupe) throw new UserError(`${input.email} is already on your team.`);
  }
  const [departmentId, positionId, locationIds, employeeNo, attendance, managedDepts] = await Promise.all([
    resolveNamed(ctx.company.id, "department", input.departmentName),
    resolveNamed(ctx.company.id, "position", input.positionName),
    validLocationIds(ctx, input.locationIds),
    input.employeeNo ? Promise.resolve(input.employeeNo) : nextEmployeeNo(ctx.company.id),
    attendanceData(ctx, input),
    managedDepartmentIds(ctx, input),
  ]);
  const count = await prisma.employee.count({ where: { companyId: ctx.company.id } });
  const employee = await prisma.employee.create({
    data: {
      ...employeeData(input),
      ...sensitiveData(input),
      ...attendance,
      companyId: ctx.company.id,
      employeeNo,
      departmentId,
      positionId,
      status: input.email ? "INVITED" : "ACTIVE",
      color: PALETTE[count % PALETTE.length]!,
      locations: { create: locationIds.map((locationId) => ({ locationId })) },
      managedDepartments: { create: managedDepts.map((departmentId) => ({ departmentId })) },
    },
  });
  await writeAudit(actorFrom(ctx), {
    action: "employee.create",
    entityType: "Employee",
    entityId: employee.id,
    after: {
      name: fullName(employee),
      role: employee.role,
      payType: employee.payType,
      rateCentavos: employee.rateCentavos,
    },
  });
  if (input.email && opts.sendInvite !== false) await sendInvitation(ctx, employee.id);
  await syncTerminals(ctx, employee.id);
  return employee;
}

export async function updateEmployee(ctx: AppContext, employeeId: string, raw: unknown) {
  if (!ctx.canViewPay) throw new UserError("Ask HR or an admin to change profiles and pay.");
  const input = employeeInputSchema.parse(raw);
  const before = await ctx.db.employee.findUnique({
    where: { id: employeeId },
    include: { locations: true },
  });
  if (!before) throw new UserError("Employee not found.");
  if (before.role === "OWNER" && input.role !== "EMPLOYEE") {
    // Owners keep their role; the form can't demote them.
  } else {
    assertCanAssignRole(ctx, input.role);
  }
  const hrEditable = ctx.isHr && (before.role === "MANAGER" || before.role === "TIMEKEEPER");
  if (!ctx.isAdmin && !hrEditable && before.role !== "EMPLOYEE")
    throw new UserError("Only admins can edit managers.");
  await assertEmployeeInScope(ctx, employeeId).catch(() => {
    throw new UserError("You can only edit people at locations you manage.");
  });
  const [departmentId, positionId, locationIds, attendance, managedDepts] = await Promise.all([
    resolveNamed(ctx.company.id, "department", input.departmentName),
    resolveNamed(ctx.company.id, "position", input.positionName),
    validLocationIds(ctx, input.locationIds),
    attendanceData(ctx, input, employeeId),
    managedDepartmentIds(ctx, input),
  ]);
  const data = {
    ...employeeData(input),
    ...sensitiveData(input),
    ...attendance,
    role: before.role === "OWNER" ? "OWNER" : input.role,
    employeeNo: input.employeeNo ?? before.employeeNo,
    departmentId,
    positionId,
  } as const;
  const after = await prisma.$transaction(async (tx) => {
    await tx.employeeLocation.deleteMany({ where: { employeeId } });
    await tx.employeeLocation.createMany({
      data: locationIds.map((locationId) => ({ employeeId, locationId })),
    });
    await tx.employeeDepartment.deleteMany({ where: { employeeId } });
    await tx.employeeDepartment.createMany({
      data: managedDepts.map((departmentId) => ({ employeeId, departmentId })),
    });
    return tx.employee.update({ where: { id: employeeId, companyId: ctx.company.id }, data });
  });
  await writeAudit(actorFrom(ctx), {
    action: "employee.update",
    entityType: "Employee",
    entityId: employeeId,
    before: {
      role: before.role,
      payType: before.payType,
      rateCentavos: before.rateCentavos,
      name: fullName(before),
    },
    after: {
      role: after.role,
      payType: after.payType,
      rateCentavos: after.rateCentavos,
      name: fullName(after),
    },
  });
  await syncTerminals(ctx, employeeId);
  return after;
}

export async function archiveEmployee(ctx: AppContext, employeeId: string) {
  const emp = await ctx.db.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw new UserError("Employee not found.");
  if (emp.role === "OWNER") throw new UserError("The owner can't be archived.");
  if (emp.id === ctx.employee.id) throw new UserError("You can't archive yourself.");
  await ctx.db.employee.update({
    where: { id: employeeId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
  await writeAudit(actorFrom(ctx), {
    action: "employee.archive",
    entityType: "Employee",
    entityId: employeeId,
  });
  await syncTerminals(ctx, employeeId);
}

export async function restoreEmployee(ctx: AppContext, employeeId: string) {
  await ensureSeat(ctx);
  const emp = await ctx.db.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw new UserError("Employee not found.");
  await ctx.db.employee.update({
    where: { id: employeeId },
    data: { status: emp.userId ? "ACTIVE" : emp.email ? "INVITED" : "ACTIVE", archivedAt: null },
  });
  await writeAudit(actorFrom(ctx), {
    action: "employee.restore",
    entityType: "Employee",
    entityId: employeeId,
  });
  await syncTerminals(ctx, employeeId);
}

const INVITE_DAYS = 14;

export async function sendInvitation(ctx: AppContext, employeeId: string) {
  const emp = await ctx.db.employee.findUnique({ where: { id: employeeId } });
  if (!emp?.email) throw new UserError("Add an email address before sending an invite.");
  if (emp.userId) throw new UserError(`${fullName(emp)} has already joined.`);
  const token = randomToken();
  await prisma.invitation.create({
    data: {
      companyId: ctx.company.id,
      employeeId,
      email: emp.email,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    },
  });
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${token}`;
  await sendEmail({
    to: emp.email,
    subject: `${ctx.company.name} invited you to ClockTime`,
    html: layout(
      `Join ${ctx.company.name} on ClockTime`,
      `<p>Hi ${escapeHtml(emp.firstName)},</p><p>${escapeHtml(ctx.user.name)} added you to <b>${escapeHtml(ctx.company.name)}</b>. Set up your account to clock in, see your schedule and get your payslips.</p>`,
      { label: "Set up my account", url },
    ),
    text: `Join ${ctx.company.name} on ClockTime: ${url}`,
  });
  return url;
}

export async function findInvitation(token: string) {
  const invite = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { company: { select: { id: true, name: true } }, employee: true },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date() || invite.employee.status === "ARCHIVED")
    return null;
  return invite;
}

export async function acceptInvitation(token: string, user: { id: string; email: string }) {
  const invite = await findInvitation(token);
  if (!invite)
    throw new UserError("This invite link is invalid or has expired. Ask your manager for a new one.");
  const existing = await prisma.employee.findFirst({
    where: { companyId: invite.companyId, userId: user.id },
  });
  if (existing && existing.id !== invite.employeeId)
    throw new UserError("You're already a member of this company.");
  await prisma.$transaction([
    prisma.employee.update({
      where: { id: invite.employeeId },
      data: { userId: user.id, status: "ACTIVE", email: invite.employee.email ?? user.email },
    }),
    prisma.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    prisma.user.update({ where: { id: user.id }, data: { activeCompanyId: invite.companyId } }),
  ]);
  await writeAudit(
    { companyId: invite.companyId, userId: user.id, label: user.email },
    { action: "invite.accept", entityType: "Employee", entityId: invite.employeeId },
  );
  return invite.companyId;
}

export async function findCompanyByJoinCode(code: string) {
  const normalized = code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (normalized.length !== 8) return null;
  return prisma.company.findUnique({
    where: { joinCode: normalized },
    select: { id: true, name: true, plan: true, planStatus: true, trialEndsAt: true, paidThrough: true },
  });
}

export async function joinWithCode(code: string, user: { id: string; name: string; email: string }) {
  const company = await findCompanyByJoinCode(code);
  if (!company) throw new UserError("That company code wasn't found. Check it with your manager.");
  const already = await prisma.employee.findFirst({ where: { companyId: company.id, userId: user.id } });
  if (already) {
    await prisma.user.update({ where: { id: user.id }, data: { activeCompanyId: company.id } });
    return company.id;
  }
  // An employee record created by the manager with the same email gets linked instead of duplicated.
  const byEmail = await prisma.employee.findFirst({
    where: {
      companyId: company.id,
      email: user.email.toLowerCase(),
      userId: null,
      status: { not: "ARCHIVED" },
    },
  });
  const plan = effectivePlan(company);
  if (!byEmail && !canAddSeat(plan, await activeSeatCount(company.id))) {
    throw new UserError("This company has reached its plan's team size. Ask your manager to upgrade.");
  }
  const employee = byEmail
    ? await prisma.employee.update({ where: { id: byEmail.id }, data: { userId: user.id, status: "ACTIVE" } })
    : await prisma.employee.create({
        data: {
          companyId: company.id,
          userId: user.id,
          ...splitName(user.name),
          email: user.email.toLowerCase(),
          status: "ACTIVE",
          employeeNo: await nextEmployeeNo(company.id),
          color:
            PALETTE[(await prisma.employee.count({ where: { companyId: company.id } })) % PALETTE.length]!,
          locations: {
            create: (
              await prisma.location.findMany({ where: { companyId: company.id, archivedAt: null }, take: 1 })
            ).map((l) => ({
              locationId: l.id,
            })),
          },
        },
      });
  await prisma.user.update({ where: { id: user.id }, data: { activeCompanyId: company.id } });
  await writeAudit(
    { companyId: company.id, userId: user.id, label: user.email },
    { action: "employee.join", entityType: "Employee", entityId: employee.id },
  );
  return company.id;
}

export type ImportRowResult = { row: number; ok: boolean; name?: string; error?: string };

/** Validate (dryRun) or import CSV rows. Returns per-row results. */
export async function importEmployees(ctx: AppContext, rows: Record<string, string>[], dryRun: boolean) {
  if (rows.length === 0) throw new UserError("The file has no rows.");
  const max = maxImportRows(ctx.plan);
  if (rows.length > max) throw new UserError(`Import up to ${max} people at a time.`);
  const results: ImportRowResult[] = [];
  const seenEmails = new Set<string>();
  const parsed = rows.map((row, i) => {
    const r = employeeInputSchema.safeParse(csvRowToInput(row));
    if (!r.success) {
      results.push({ row: i + 2, ok: false, error: r.error.issues[0]?.message ?? "Invalid row" });
      return null;
    }
    if (r.data.email) {
      if (seenEmails.has(r.data.email)) {
        results.push({ row: i + 2, ok: false, error: `Duplicate email ${r.data.email}` });
        return null;
      }
      seenEmails.add(r.data.email);
    }
    return { index: i, input: r.data };
  });
  const valid = parsed.filter((p): p is NonNullable<typeof p> => p !== null);
  const seats = await activeSeatCount(ctx.company.id);
  if (!canAddSeat(ctx.plan, seats + valid.length - 1)) {
    throw new UserError(
      `Importing ${valid.length} people would exceed the ${PLANS[ctx.plan].name} plan's limit.`,
    );
  }
  for (const p of valid) {
    const name = `${p.input.firstName} ${p.input.lastName}`.trim();
    if (dryRun) {
      if (
        p.input.email &&
        (await ctx.db.employee.findFirst({ where: { email: p.input.email, status: { not: "ARCHIVED" } } }))
      ) {
        results.push({
          row: p.index + 2,
          ok: false,
          name,
          error: `${p.input.email} is already on your team`,
        });
      } else {
        results.push({ row: p.index + 2, ok: true, name });
      }
      continue;
    }
    try {
      await addEmployee(ctx, { ...p.input, rate: p.input.rate }, { sendInvite: true });
      results.push({ row: p.index + 2, ok: true, name });
    } catch (err) {
      results.push({
        row: p.index + 2,
        ok: false,
        name,
        error: err instanceof Error ? err.message : "Failed",
      });
    }
  }
  return results.sort((a, b) => a.row - b.row);
}

export async function setEmployeePin(ctx: AppContext, employeeId: string, pin: string) {
  const lookup = pinLookup(ctx.company.id, pin);
  const clash = await ctx.db.employee.findFirst({ where: { pinLookup: lookup, id: { not: employeeId } } });
  if (clash) throw new UserError("That PIN is already used by someone else. Choose another.");
  await ctx.db.employee.update({
    where: { id: employeeId },
    data: { pinHash: await hashSecret(pin), pinLookup: lookup },
  });
  await writeAudit(actorFrom(ctx), {
    action: "employee.pin.set",
    entityType: "Employee",
    entityId: employeeId,
  });
}

export async function regenerateBadge(ctx: AppContext, employeeId: string) {
  await ctx.db.employee.update({ where: { id: employeeId }, data: { qrToken: randomUUID() } });
  await writeAudit(actorFrom(ctx), {
    action: "employee.badge.reset",
    entityType: "Employee",
    entityId: employeeId,
  });
}

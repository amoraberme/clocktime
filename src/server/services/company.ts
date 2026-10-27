import "server-only";
import { TRIAL_DAYS } from "@/config/plans";
import type { PayFrequency, Plan } from "@/generated/prisma/enums";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { slugify } from "@/lib/utils";
import { randomCode } from "../crypto";
import { prisma } from "../db";

/** Plan new companies trial. Pro lets prospects try payroll before paying. */
export const TRIAL_PLAN: Plan = "PRO";

export const DEFAULT_LEAVE_TYPES = [
  { code: "SIL", name: "Service Incentive Leave", paid: true, annualDays: 5, isSil: true },
  { code: "VL", name: "Vacation leave", paid: true, annualDays: 0, isSil: false },
  { code: "SL", name: "Sick leave", paid: true, annualDays: 0, isSil: false },
  { code: "UL", name: "Unpaid leave", paid: false, annualDays: 0, isSil: false },
];

export type CreateCompanyInput = {
  name: string;
  industry?: string;
  timezone?: string;
  payFrequency: PayFrequency;
  owner: { userId: string; name: string; email: string };
  location: { name: string; address?: string; latitude?: number | null; longitude?: number | null };
};

async function uniqueSlug(name: string) {
  const base = slugify(name) || "company";
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${randomCode(4).toLowerCase()}`;
    if (!(await prisma.company.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${Date.now()}`;
}

async function uniqueJoinCode() {
  for (;;) {
    const code = randomCode(8);
    if (!(await prisma.company.findUnique({ where: { joinCode: code }, select: { id: true } }))) return code;
  }
}

export function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1)! };
}

export async function createCompany(input: CreateCompanyInput) {
  const slug = await uniqueSlug(input.name);
  const joinCode = await uniqueJoinCode();
  const { firstName, lastName } = splitName(input.owner.name);
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: input.name.trim(),
        slug,
        joinCode,
        industry: input.industry,
        timezone: input.timezone ?? "Asia/Manila",
        payFrequency: input.payFrequency,
        settings: DEFAULT_SETTINGS,
        plan: TRIAL_PLAN,
        planStatus: "TRIALING",
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
        onboardedAt: new Date(),
      },
    });
    const location = await tx.location.create({
      data: {
        companyId: company.id,
        name: input.location.name.trim() || "Main",
        address: input.location.address,
        latitude: input.location.latitude ?? null,
        longitude: input.location.longitude ?? null,
      },
    });
    const owner = await tx.employee.create({
      data: {
        companyId: company.id,
        userId: input.owner.userId,
        firstName,
        lastName,
        email: input.owner.email,
        role: "OWNER",
        status: "ACTIVE",
        hireDate: new Date(),
        employeeNo: "0001",
        locations: { create: [{ locationId: location.id }] },
      },
    });
    await tx.leaveType.createMany({
      data: DEFAULT_LEAVE_TYPES.map((t) => ({ ...t, companyId: company.id })),
    });
    await tx.user.update({ where: { id: input.owner.userId }, data: { activeCompanyId: company.id } });
    return { company, location, owner };
  });
}

export async function regenerateJoinCode(companyId: string) {
  const joinCode = await uniqueJoinCode();
  await prisma.company.update({ where: { id: companyId }, data: { joinCode } });
  return joinCode;
}

/** Number of people who count toward plan limits and billing. */
export async function activeSeatCount(companyId: string) {
  return prisma.employee.count({ where: { companyId, status: { in: ["ACTIVE", "INVITED"] } } });
}

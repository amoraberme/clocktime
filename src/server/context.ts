import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Feature } from "@/config/plans";
import type { Role } from "@/generated/prisma/enums";
import { effectivePlan, FeatureError, hasFeature } from "@/lib/entitlements";
import { parseSettings } from "@/lib/settings";
import { auth } from "./auth";
import { prisma } from "./db";
import { tenantDb } from "./tenant";

// HR sits below ADMIN: nationwide people, payroll and approvals, but no billing, API keys or settings.
const ROLE_RANK: Record<Role, number> = { EMPLOYEE: 1, MANAGER: 2, TIMEKEEPER: 2, HR: 3, ADMIN: 4, OWNER: 5 };

export type Approval = "leave" | "overtime" | "attendance" | "schedule";

/** Who may approve each kind of request. Timekeepers handle attendance and schedules only. */
export function canApprove(role: Role, kind: Approval) {
  if (role === "EMPLOYEE") return false;
  if (role === "TIMEKEEPER") return kind === "attendance" || kind === "schedule";
  return true;
}

export function roleAtLeast(role: Role, min: Role) {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

export function isSuperAdmin(email: string) {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

async function loadContext() {
  const session = await getSession();
  if (!session) return null;
  const memberships = await prisma.employee.findMany({
    where: { userId: session.user.id, status: { not: "ARCHIVED" } },
    include: {
      company: true,
      locations: { select: { locationId: true } },
      managedDepartments: { select: { departmentId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return { user: session.user, memberships, current: null };
  const activeId = (session.user as { activeCompanyId?: string | null }).activeCompanyId;
  const current = memberships.find((m) => m.companyId === activeId) ?? memberships[0]!;
  return { user: session.user, memberships, current };
}

export type AppContext = NonNullable<Awaited<ReturnType<typeof buildContext>>>;

const buildContext = cache(async () => {
  const loaded = await loadContext();
  if (!loaded?.current) return null;
  const { user, memberships, current } = loaded;
  const { company, locations, managedDepartments, ...employee } = current;
  const plan = effectivePlan(company);
  const role = employee.role;
  const isManager = roleAtLeast(role, "MANAGER");
  // Owners, admins and HR see every branch; supervisors and timekeepers only those they're
  // assigned to (none assigned = all).
  const managedLocationIds =
    roleAtLeast(role, "HR") || locations.length === 0 ? null : locations.map((l) => l.locationId);
  // Supervisors can also be limited to departments (none assigned = all departments).
  const managedDepartmentIds =
    roleAtLeast(role, "ADMIN") || managedDepartments.length === 0
      ? null
      : managedDepartments.map((d) => d.departmentId);
  const settings = parseSettings(company.settings);
  return {
    user: user as typeof user & { twoFactorEnabled?: boolean | null },
    company,
    employee,
    role,
    plan,
    isManager,
    isAdmin: roleAtLeast(role, "ADMIN"),
    isHr: roleAtLeast(role, "HR"),
    /** Timekeepers review attendance without seeing pay rates or amounts. */
    canViewPay: role !== "TIMEKEEPER",
    approves: (kind: Approval) => canApprove(role, kind),
    managedLocationIds,
    managedDepartmentIds,
    settings,
    /** Owners, admins and HR whose company requires 2FA but who haven't turned it on yet. */
    needsTwoFactor:
      settings.requireTwoFactor &&
      roleAtLeast(role, "HR") &&
      !(user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled,
    db: tenantDb(company.id),
    memberships: memberships.map((m) => ({ companyId: m.companyId, name: m.company.name, role: m.role })),
    can: (feature: Feature) => hasFeature(plan, feature),
  };
});

/** Context for any signed-in member. Redirects to login/onboarding when missing. */
export async function requireContext(minRole: Role = "EMPLOYEE") {
  const session = await getSession();
  if (!session) redirect("/login");
  const ctx = await buildContext();
  if (!ctx) redirect("/onboarding");
  if (!roleAtLeast(ctx.role, minRole)) redirect(ctx.isManager ? "/app" : "/me");
  if (ctx.needsTwoFactor && roleAtLeast(minRole, "MANAGER"))
    redirect("/me/profile?twoFactor=required#two-factor");
  return ctx;
}

/** Like requireContext but throws instead of redirecting, for server actions and API routes. */
export async function getContextOrThrow(minRole: Role = "EMPLOYEE") {
  const ctx = await buildContext();
  if (!ctx) throw new AuthError("You need to sign in.");
  if (!roleAtLeast(ctx.role, minRole)) throw new AuthError("You don't have permission to do that.");
  if (ctx.needsTwoFactor && roleAtLeast(minRole, "MANAGER"))
    throw new AuthError("Turn on two-step verification in your profile first.");
  return ctx;
}

export function requireFeature(ctx: AppContext, feature: Feature) {
  if (!ctx.can(feature)) throw new FeatureError(feature);
}

export class AuthError extends Error {}

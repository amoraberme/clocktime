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

const ROLE_RANK: Record<Role, number> = { EMPLOYEE: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 };

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
    include: { company: true, locations: { select: { locationId: true } } },
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
  const { company, locations, ...employee } = current;
  const plan = effectivePlan(company);
  const role = employee.role;
  const isManager = roleAtLeast(role, "MANAGER");
  // Owners/admins see every location; managers only those assigned (none assigned = all).
  const managedLocationIds =
    roleAtLeast(role, "ADMIN") || locations.length === 0 ? null : locations.map((l) => l.locationId);
  return {
    user,
    company,
    employee,
    role,
    plan,
    isManager,
    isAdmin: roleAtLeast(role, "ADMIN"),
    managedLocationIds,
    settings: parseSettings(company.settings),
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
  return ctx;
}

/** Like requireContext but throws instead of redirecting, for server actions and API routes. */
export async function getContextOrThrow(minRole: Role = "EMPLOYEE") {
  const ctx = await buildContext();
  if (!ctx) throw new AuthError("You need to sign in.");
  if (!roleAtLeast(ctx.role, minRole)) throw new AuthError("You don't have permission to do that.");
  return ctx;
}

export function requireFeature(ctx: AppContext, feature: Feature) {
  if (!ctx.can(feature)) throw new FeatureError(feature);
}

export class AuthError extends Error {}

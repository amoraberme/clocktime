import { randomUUID } from "node:crypto";
import type { Plan } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { createCompany } from "@/server/services/company";
import { tenantDb } from "@/server/tenant";
import { parseSettings } from "@/lib/settings";
import { hasFeature } from "@/lib/entitlements";
import type { AppContext } from "@/server/context";

export async function makeUser(name = "Test Owner") {
  const id = randomUUID();
  return prisma.user.create({ data: { id, name, email: `${id}@test.local`, emailVerified: true } });
}

/** Creates an isolated company (with owner) and returns an AppContext-like object for services. */
export async function makeCompany(
  opts: { plan?: Plan; location?: { latitude: number; longitude: number } } = {},
) {
  const user = await makeUser();
  const { company, owner, location } = await createCompany({
    name: `Test Co ${user.id.slice(0, 6)}`,
    payFrequency: "SEMI_MONTHLY",
    owner: { userId: user.id, name: user.name, email: user.email },
    location: { name: "HQ", latitude: opts.location?.latitude, longitude: opts.location?.longitude },
  });
  const plan = opts.plan ?? "PRO";
  const updated = await prisma.company.update({
    where: { id: company.id },
    data: { plan, planStatus: "ACTIVE" },
  });
  const ctx = {
    user: { ...user, activeCompanyId: company.id },
    company: updated,
    employee: owner,
    role: owner.role,
    plan,
    isManager: true,
    isAdmin: true,
    managedLocationIds: null,
    settings: parseSettings(updated.settings),
    db: tenantDb(company.id),
    memberships: [],
    can: (f: Parameters<typeof hasFeature>[1]) => hasFeature(plan, f),
  } as unknown as AppContext;
  return { ctx, company: updated, owner, location, user };
}

export async function cleanup(companyIds: string[]) {
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}

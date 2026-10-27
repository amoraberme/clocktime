import { PAST_DUE_GRACE_DAYS, PLANS, type Feature } from "@/config/plans";
import type { Plan, PlanStatus } from "@/generated/prisma/enums";

type CompanyPlanFields = {
  plan: Plan;
  planStatus: PlanStatus;
  trialEndsAt: Date | null;
  paidThrough: Date | null;
};

const DAY = 86_400_000;

/** The plan a company actually gets right now, after trials and grace periods. */
export function effectivePlan(company: CompanyPlanFields, now = new Date()): Plan {
  if (company.plan === "FREE") return "FREE";
  switch (company.planStatus) {
    case "ACTIVE":
      return company.plan;
    case "TRIALING":
      return company.trialEndsAt && company.trialEndsAt.getTime() > now.getTime() ? company.plan : "FREE";
    case "PAST_DUE": {
      const until = company.paidThrough ? company.paidThrough.getTime() + PAST_DUE_GRACE_DAYS * DAY : 0;
      return until > now.getTime() ? company.plan : "FREE";
    }
    case "CANCELED":
      return company.paidThrough && company.paidThrough.getTime() > now.getTime() ? company.plan : "FREE";
  }
}

export function hasFeature(plan: Plan, feature: Feature) {
  return PLANS[plan].features.includes(feature);
}

/** Which plan first unlocks a feature, for upgrade prompts. */
export function planFor(feature: Feature): Plan {
  if (PLANS.FREE.features.includes(feature)) return "FREE";
  if (PLANS.STARTER.features.includes(feature)) return "STARTER";
  return "PRO";
}

export function canAddSeat(plan: Plan, activeSeats: number) {
  const max = PLANS[plan].maxSeats;
  return max === null || activeSeats < max;
}

export function canAddLocation(plan: Plan, locations: number) {
  const max = PLANS[plan].maxLocations;
  return max === null || locations < max;
}

export function trialDaysLeft(company: CompanyPlanFields, now = new Date()) {
  if (company.planStatus !== "TRIALING" || !company.trialEndsAt) return 0;
  return Math.max(0, Math.ceil((company.trialEndsAt.getTime() - now.getTime()) / DAY));
}

export class FeatureError extends Error {
  constructor(public feature: Feature) {
    super(`This feature needs the ${PLANS[planFor(feature)].name} plan.`);
  }
}

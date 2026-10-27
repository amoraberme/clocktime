import Link from "next/link";
import { ManagerShell } from "@/components/shell/manager-shell";
import { MANAGER_NAV } from "@/components/shell/nav-config";
import { PLANS } from "@/config/plans";
import { trialDaysLeft } from "@/lib/entitlements";
import { switchCompanyAction } from "@/server/actions/session";
import { requireContext } from "@/server/context";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext("MANAGER");
  const openExceptions = ctx.can("exceptions")
    ? await ctx.db.timeException.count({ where: { status: "OPEN" } })
    : 0;
  const nav = MANAGER_NAV.filter((i) => !i.adminOnly || ctx.isAdmin).map((i) => ({
    ...i,
    locked: i.feature ? !ctx.can(i.feature) : false,
    badge: i.href === "/app/exceptions" ? openExceptions : undefined,
  }));
  const daysLeft = trialDaysLeft(ctx.company);
  const downgraded = ctx.company.plan !== ctx.plan;
  const banner =
    ctx.company.planStatus === "TRIALING" && daysLeft > 0 ? (
      <div className="border-b bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        {daysLeft} day{daysLeft === 1 ? "" : "s"} left in your {PLANS[ctx.company.plan].name} trial.{" "}
        {ctx.isAdmin ? (
          <Link href="/app/settings/billing" className="font-medium underline">
            Choose a plan
          </Link>
        ) : null}
      </div>
    ) : downgraded ? (
      <div className="bg-danger-soft text-danger border-b px-4 py-2 text-center text-sm">
        Your {PLANS[ctx.company.plan].name} access has ended, so you&apos;re on the Free plan. Your data is
        safe.{" "}
        {ctx.isAdmin ? (
          <Link href="/app/settings/billing" className="font-medium underline">
            Reactivate
          </Link>
        ) : null}
      </div>
    ) : null;

  return (
    <ManagerShell
      nav={nav}
      companyName={ctx.company.name}
      userName={ctx.user.name}
      userEmail={ctx.user.email}
      planLabel={
        PLANS[ctx.plan].name + (ctx.company.planStatus === "TRIALING" && daysLeft > 0 ? " trial" : "")
      }
      banner={banner}
      memberships={ctx.memberships}
      switchCompany={switchCompanyAction}
    >
      {children}
    </ManagerShell>
  );
}

import { redirect } from "next/navigation";
import { getSession } from "@/server/context";
import { prisma } from "@/server/db";

/** Post-login router: managers → dashboard, employees → clock, no company → onboarding. */
export default async function HomeRedirect() {
  const session = await getSession();
  if (!session) redirect("/login");
  const memberships = await prisma.employee.findMany({
    where: { userId: session.user.id, status: { not: "ARCHIVED" } },
    select: { companyId: true, role: true },
  });
  if (memberships.length === 0) redirect("/onboarding");
  const activeId = (session.user as { activeCompanyId?: string | null }).activeCompanyId;
  const current = memberships.find((m) => m.companyId === activeId) ?? memberships[0]!;
  redirect(current.role === "EMPLOYEE" ? "/me" : "/app");
}

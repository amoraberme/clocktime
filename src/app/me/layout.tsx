import { EmployeeShell } from "@/components/shell/employee-shell";
import { EMPLOYEE_NAV } from "@/components/shell/nav-config";
import { requireContext } from "@/server/context";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext("EMPLOYEE");
  const nav = EMPLOYEE_NAV.filter((i) => !i.feature || ctx.can(i.feature));
  return (
    <EmployeeShell
      nav={nav}
      companyName={ctx.company.name}
      userName={ctx.user.name}
      isManager={ctx.isManager}
    >
      {children}
    </EmployeeShell>
  );
}

import { PageHeader } from "@/components/ui/misc";
import { requireContext } from "@/server/context";

export default async function DashboardPage() {
  const ctx = await requireContext("MANAGER");
  return (
    <PageHeader title={`Good day, ${ctx.user.name.split(" ")[0]}`} description="Your team at a glance." />
  );
}

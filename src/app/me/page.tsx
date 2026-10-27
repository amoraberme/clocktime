import { PageHeader } from "@/components/ui/misc";
import { requireContext } from "@/server/context";

export default async function ClockPage() {
  const ctx = await requireContext();
  return <PageHeader title={`Hi, ${ctx.employee.firstName}`} />;
}

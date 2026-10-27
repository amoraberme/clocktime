import { SettingsNav } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/ui/misc";
import { requireContext } from "@/server/context";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireContext("ADMIN");
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsNav />
      {children}
    </>
  );
}

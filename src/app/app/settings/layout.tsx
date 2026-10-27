import { SettingsNav } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/ui/misc";
import { requireContext } from "@/server/context";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext("HR");
  // Enterprise-only pages stay out of the menu until the plan includes them.
  const hidden = [
    ...(ctx.can("regions") ? [] : ["/app/settings/regions"]),
    ...(ctx.can("multiLevelApproval") ? [] : ["/app/settings/approvals"]),
    ...(ctx.can("biometricDevices") ? [] : ["/app/settings/devices"]),
    ...(ctx.can("webhooks") ? [] : ["/app/settings/webhooks"]),
  ];
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsNav isAdmin={ctx.isAdmin} hidden={hidden} />
      {children}
    </>
  );
}

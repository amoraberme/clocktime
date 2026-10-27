import { DangerZone } from "@/components/settings/danger-zone";
import { GeneralForm } from "@/components/settings/general-form";
import { SettingsForm } from "@/components/settings/settings-form";
import { requireContext } from "@/server/context";

export default async function GeneralSettingsPage() {
  const ctx = await requireContext("ADMIN");
  return (
    <div className="space-y-6">
      <GeneralForm
        values={{
          name: ctx.company.name,
          industry: ctx.company.industry ?? "",
          timezone: ctx.company.timezone,
          payFrequency: ctx.company.payFrequency,
        }}
      />
      <SettingsForm
        title="Security & privacy"
        values={ctx.settings}
        fields={[
          {
            key: "requireTwoFactor",
            label: "Require two-step verification for owners, admins and HR",
            hint: "They're sent to their profile to set up an authenticator app before they can use the admin pages.",
            type: "boolean",
          },
          {
            key: "locationRetentionDays",
            label: "Keep punch GPS locations for",
            hint: "Coordinates are cleared after this; the branch and times stay for payroll and audits.",
            type: "number",
            min: 30,
            max: 3650,
            suffix: "days",
          },
        ]}
      />
      <SettingsForm
        title="Calendar"
        values={ctx.settings}
        fields={[
          {
            key: "weekStartsOn",
            label: "Week starts on",
            type: "select",
            numeric: true,
            options: [
              { value: "1", label: "Monday" },
              { value: "0", label: "Sunday" },
            ],
          },
          {
            key: "payDateOffsetDays",
            label: "Payday",
            type: "number",
            min: 0,
            max: 31,
            suffix: "days after cut-off",
            hint: "e.g. cut-off 15th + 5 days = paid on the 20th",
          },
        ]}
      />
      <DangerZone companyName={ctx.company.name} isOwner={ctx.role === "OWNER"} />
    </div>
  );
}

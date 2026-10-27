import { SettingsForm } from "@/components/settings/settings-form";
import { UpgradeCard } from "@/components/upgrade-card";
import { requireContext } from "@/server/context";

const LEVELS = [
  { value: "1", label: "One approver (supervisor or HR)" },
  { value: "2", label: "Two levels: supervisor, then HR" },
];

export default async function ApprovalSettingsPage() {
  const ctx = await requireContext("ADMIN");
  if (!ctx.can("multiLevelApproval"))
    return (
      <UpgradeCard
        feature="multiLevelApproval"
        title="Two-level approvals"
        description="Have branch supervisors endorse requests and HR give the final approval."
      />
    );
  return (
    <SettingsForm
      title="Approval levels"
      values={ctx.settings}
      fields={[
        { key: "approvalLevelsLeave", label: "Leave", type: "select", numeric: true, options: LEVELS },
        { key: "approvalLevelsOvertime", label: "Overtime", type: "select", numeric: true, options: LEVELS },
        {
          key: "approvalLevelsSchedule",
          label: "Schedule changes",
          type: "select",
          numeric: true,
          options: LEVELS,
        },
        {
          key: "approvalLevelsCorrection",
          label: "Attendance corrections",
          type: "select",
          numeric: true,
          options: LEVELS,
          hint: "HR's approval always counts as final, at either level.",
        },
      ]}
    />
  );
}

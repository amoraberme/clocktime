import { SettingsForm } from "@/components/settings/settings-form";
import { requireContext } from "@/server/context";

export default async function PaySettingsPage() {
  const ctx = await requireContext("ADMIN");
  return (
    <SettingsForm
      title="Pay rules"
      values={ctx.settings}
      fields={[
        {
          key: "dailyRegularMinutes",
          label: "Regular hours per day",
          type: "number",
          min: 60,
          max: 720,
          step: 30,
          suffix: "minutes",
          hint: "Overtime starts after this (480 = 8 hours).",
        },
        {
          key: "nightDiffStartMinute",
          label: "Night differential starts",
          type: "time",
          hint: "Labor Code: 10:00 PM",
        },
        {
          key: "nightDiffEndMinute",
          label: "Night differential ends",
          type: "time",
          hint: "Labor Code: 6:00 AM",
        },
        {
          key: "contributionSchedule",
          label: "Deduct SSS, PhilHealth & Pag-IBIG",
          type: "select",
          options: [
            { value: "SPLIT", label: "Half each cut-off" },
            { value: "SECOND_CUTOFF", label: "All on the 2nd cut-off" },
            { value: "FIRST_CUTOFF", label: "All on the 1st cut-off" },
          ],
          hint: "For semi-monthly payroll",
        },
        {
          key: "overtimeRequiresApproval",
          label: "Only pay overtime that a manager approved",
          type: "boolean",
          hint: "Unapproved overtime shows in the exception inbox.",
        },
        {
          key: "unworkedRegularHolidayPaid",
          label: "Pay unworked regular holidays (100%)",
          type: "boolean",
          hint: "Required by law for eligible daily-paid staff.",
        },
        {
          key: "unworkedSpecialDayPaid",
          label: "Pay unworked special non-working days",
          type: "boolean",
          hint: "Default is “no work, no pay” unless company policy says otherwise.",
        },
      ]}
    />
  );
}

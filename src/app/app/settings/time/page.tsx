import { SettingsForm } from "@/components/settings/settings-form";
import { requireContext } from "@/server/context";

export default async function TimeSettingsPage() {
  const ctx = await requireContext("ADMIN");
  return (
    <SettingsForm
      title="Time & attendance rules"
      values={ctx.settings}
      fields={[
        {
          key: "roundingMinutes",
          label: "Round punches to",
          type: "select",
          numeric: true,
          options: [
            { value: "0", label: "Exact minute (recommended)" },
            { value: "5", label: "5 minutes" },
            { value: "10", label: "10 minutes" },
            { value: "15", label: "15 minutes" },
          ],
          hint: "DOLE requires paying all time worked; rounding should be neutral.",
        },
        {
          key: "roundingMode",
          label: "Rounding direction",
          type: "select",
          options: [
            { value: "nearest", label: "Nearest" },
            { value: "down", label: "Down" },
            { value: "up", label: "Up" },
          ],
        },
        {
          key: "lateGraceMinutes",
          label: "Late grace period",
          type: "number",
          min: 0,
          max: 120,
          suffix: "minutes",
        },
        {
          key: "mealBreakMinutes",
          label: "Standard meal break",
          type: "number",
          min: 0,
          max: 180,
          suffix: "minutes",
          hint: "Unpaid. The Labor Code minimum is 60 minutes.",
        },
        {
          key: "autoDeductBreakAfterMinutes",
          label: "Auto-deduct meal break after",
          type: "number",
          min: 0,
          max: 1440,
          suffix: "minutes worked",
        },
        {
          key: "longBreakToleranceMinutes",
          label: "Flag breaks longer than meal break +",
          type: "number",
          min: 0,
          max: 120,
          suffix: "minutes",
        },
        {
          key: "missedClockOutHours",
          label: "Flag missed clock-out after",
          type: "number",
          min: 4,
          max: 36,
          suffix: "hours",
        },
        {
          key: "maxShiftHours",
          label: "Longest shift you can schedule",
          type: "number",
          min: 4,
          max: 48,
          suffix: "hours",
          hint: "Set to 24 for security guards and other 24-hour duties.",
        },
        {
          key: "longDutyReviewHours",
          label: "Send duties longer than this to review",
          type: "number",
          min: 8,
          max: 48,
          suffix: "hours",
          hint: "Extra hours aren't paid as overtime until approved.",
        },
        {
          key: "maxDutyHours",
          label: "Treat a clock-in as missing its clock-out after",
          type: "number",
          min: 12,
          max: 72,
          suffix: "hours",
        },
        {
          key: "duplicatePunchMinutes",
          label: "Ignore repeat punches within",
          type: "number",
          min: 0,
          max: 30,
          suffix: "minutes",
          hint: "e.g. a fingerprint and a phone punch at the same time count once.",
        },
        {
          key: "earlyWindowHours",
          label: "Terminal taps count as clock-in up to",
          type: "number",
          min: 1,
          max: 12,
          suffix: "hours before a shift",
        },
        {
          key: "lateWindowHours",
          label: "Terminal taps count as clock-out up to",
          type: "number",
          min: 1,
          max: 24,
          suffix: "hours after a shift",
        },
        {
          key: "photoRetentionDays",
          label: "Keep punch photos for",
          type: "number",
          min: 7,
          max: 3650,
          suffix: "days",
        },
        {
          key: "clampEarlyClockIn",
          label: "Don't pay time before the scheduled start",
          type: "boolean",
          hint: "Early clock-ins count from the shift start unless approved as overtime.",
        },
        {
          key: "autoDeductBreak",
          label: "Auto-deduct the meal break when none was recorded",
          type: "boolean",
        },
        {
          key: "autoClockOutNeedsReview",
          label: "Review automatic clock-outs",
          type: "boolean",
          hint: "Clock-outs set by the system stay flagged until a manager confirms them.",
        },
        {
          key: "fieldMaxAccuracyMeters",
          label: "Field staff: worst GPS accuracy accepted",
          type: "number",
          min: 10,
          max: 1000,
          suffix: "meters",
          hint: "Drivers and sales (Enterprise). Punches with a vaguer fix are refused.",
        },
        {
          key: "fieldRequireSelfie",
          label: "Field staff take a selfie on clock-in and clock-out",
          type: "boolean",
        },
        {
          key: "requireGps",
          label: "Require GPS for phone punches",
          type: "boolean",
          hint: "Punches without a location are rejected.",
        },
      ]}
    />
  );
}

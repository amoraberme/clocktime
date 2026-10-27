import { Badge } from "@/components/ui/badge";

const FLAG_LABELS: Record<string, { label: string; tone: "warning" | "danger" | "info" | "neutral" }> = {
  MISSING_OUT: { label: "missing clock-out", tone: "danger" },
  LONG_DUTY: { label: "long duty · review", tone: "warning" },
  AUTO_OUT: { label: "auto clock-out · review", tone: "warning" },
  OFFLINE: { label: "synced offline", tone: "info" },
  UNSCHEDULED: { label: "unscheduled", tone: "neutral" },
};

const SOURCE_LABELS: Partial<Record<string, string>> = {
  BIOMETRIC: "terminal",
  IMPORT: "imported",
  KIOSK: "kiosk",
  CORRECTION: "corrected",
  MANUAL: "manual",
};

/** Badges explaining where an entry came from and what needs a second look. */
export function EntryFlags({
  flags,
  inSource,
  outSource,
  manualOverride,
}: {
  flags: string[];
  inSource: string;
  outSource?: string | null;
  manualOverride?: boolean;
}) {
  const sources = [...new Set([inSource, outSource].filter((s): s is string => !!s && !!SOURCE_LABELS[s]))];
  return (
    <>
      {sources.map((s) => (
        <Badge key={s}>{SOURCE_LABELS[s]}</Badge>
      ))}
      {manualOverride && !sources.includes("MANUAL") ? <Badge>edited</Badge> : null}
      {flags
        .filter((f) => FLAG_LABELS[f])
        .map((f) => (
          <Badge key={f} tone={FLAG_LABELS[f]!.tone}>
            {FLAG_LABELS[f]!.label}
          </Badge>
        ))}
    </>
  );
}

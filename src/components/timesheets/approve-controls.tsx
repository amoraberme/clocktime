"use client";

import { CheckCheck, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { approvalAction } from "@/app/app/timesheets/actions";
import { Button } from "@/components/ui/button";

export function ApproveButton({
  employeeIds,
  period,
  approve = true,
  label,
  variant = "default",
}: {
  employeeIds: string[];
  period: { start: string; end: string };
  approve?: boolean;
  label: string;
  variant?: "default" | "outline";
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Button
      variant={variant}
      disabled={busy || employeeIds.length === 0}
      onClick={async () => {
        setBusy(true);
        const r = await approvalAction(employeeIds, period, approve);
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        const { approved, skipped } = r.data;
        toast.success(
          `${approve ? "Approved" : "Reopened"} ${approved} timesheet${approved === 1 ? "" : "s"}.` +
            (skipped ? ` ${skipped} skipped (someone is still clocked in, or the period is locked).` : ""),
        );
        router.refresh();
      }}
    >
      {approve ? <CheckCheck /> : <Undo2 />} {label}
    </Button>
  );
}

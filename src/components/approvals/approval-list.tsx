"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { bulkDecideAction, decideRequestAction } from "@/app/app/approvals/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import type { InboxItem, InboxType } from "@/server/queries/approvals";

const TYPE_TONE: Record<InboxType, "primary" | "info" | "warning" | "neutral" | "success"> = {
  LEAVE: "info",
  OVERTIME: "warning",
  SCHEDULE: "primary",
  CORRECTION: "success",
  SWAP: "neutral",
  CLAIM: "neutral",
};

const TYPE_LABEL: Record<InboxType, string> = {
  LEAVE: "Leave",
  OVERTIME: "Overtime",
  SCHEDULE: "Schedule",
  CORRECTION: "Correction",
  SWAP: "Swap",
  CLAIM: "Open shift",
};

const key = (i: Pick<InboxItem, "type" | "id">) => `${i.type}:${i.id}`;

export function ApprovalList({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const decidable = items.filter((i) => i.canDecide);

  async function decide(item: InboxItem, approve: boolean) {
    const note = approve ? undefined : (prompt("Reason for declining (optional)") ?? undefined);
    setBusy(key(item));
    const r = await decideRequestAction({
      type: item.type,
      id: item.id,
      approve,
      note,
      minutes: item.minutes,
    });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(
      approve ? (item.approveLabel === "Endorse" ? "Endorsed to HR." : "Approved.") : "Declined.",
    );
    router.refresh();
  }

  async function bulk(approve: boolean) {
    const list = items.filter((i) => selected.has(key(i))).map((i) => ({ type: i.type, id: i.id }));
    if (!list.length) return;
    setBusy("bulk");
    const r = await bulkDecideAction(list, approve);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    if (r.data.failed) toast.warning(`${r.data.done} done, ${r.data.failed} not: ${r.data.firstError}`);
    else toast.success(`${r.data.done} ${approve ? "approved" : "declined"}.`);
    setSelected(new Set());
    router.refresh();
  }

  const allChecked = decidable.length > 0 && decidable.every((i) => selected.has(key(i)));
  return (
    <div className="space-y-3">
      {decidable.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allChecked}
              onChange={(e) => setSelected(new Set(e.target.checked ? decidable.map(key) : []))}
              aria-label="Select all"
            />
            Select all
          </label>
          <Button size="sm" disabled={!selected.size || busy === "bulk"} onClick={() => bulk(true)}>
            <Check /> Approve selected ({selected.size})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.size || busy === "bulk"}
            onClick={() => bulk(false)}
          >
            <X /> Decline selected
          </Button>
        </div>
      ) : null}
      <ul className="bg-card divide-y rounded-xl border">
        {items.map((i) => (
          <li key={key(i)} className="flex flex-wrap items-start gap-3 p-4" data-testid="approval-item">
            <Checkbox
              className="mt-1"
              disabled={!i.canDecide}
              checked={selected.has(key(i))}
              aria-label={`Select ${i.employee}`}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(key(i));
                else next.delete(key(i));
                setSelected(next);
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{i.employee}</span>
                <Badge tone={TYPE_TONE[i.type]}>{TYPE_LABEL[i.type]}</Badge>
                {i.levels === 2 ? (
                  <Badge tone={i.level === 2 ? "warning" : "neutral"}>
                    {i.level === 2 ? "Endorsed · waiting for HR" : "Level 1 of 2"}
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm">
                <span className="font-medium">{i.title}</span> · {i.detail}
              </p>
              {i.reason ? <p className="text-muted-foreground text-sm">“{i.reason}”</p> : null}
              <p className="text-muted-foreground text-xs">
                {[i.branch, i.department].filter(Boolean).join(" · ")} · filed{" "}
                {new Date(i.filedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>
            {i.canDecide ? (
              <div className="flex gap-2">
                <Button size="sm" disabled={busy === key(i)} onClick={() => decide(i, true)}>
                  {i.approveLabel}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === key(i)}
                  onClick={() => decide(i, false)}
                >
                  Decline
                </Button>
              </div>
            ) : (
              <span className="text-muted-foreground text-xs">
                {i.level === 2 ? "HR approves" : "Not yours to approve"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

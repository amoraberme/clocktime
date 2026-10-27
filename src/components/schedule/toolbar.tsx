"use client";

import { Copy, Send, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  autoFillAction,
  buildFromAvailabilityAction,
  copyWeekAction,
  publishWeekAction,
} from "@/app/app/schedule/actions";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";

export function ScheduleToolbar({
  weekStart,
  prevWeek,
  locationId,
  drafts,
  canAuto,
}: {
  weekStart: string;
  prevWeek: string;
  locationId: string | null;
  drafts: number;
  canAuto: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go<T>(
    fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    msg: (d: T) => string,
  ) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(msg(r.data));
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          go(
            () => copyWeekAction(prevWeek, weekStart, locationId),
            (n) => `Copied ${n} shift${n === 1 ? "" : "s"} from last week as drafts.`,
          )
        }
      >
        <Copy /> Copy last week
      </Button>
      {canAuto ? (
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="outline" disabled={busy}>
              <Sparkles /> Auto-schedule
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem
              onSelect={() =>
                go(
                  () => autoFillAction(weekStart, locationId),
                  (n) => `Filled ${n} open shift${n === 1 ? "" : "s"}.`,
                )
              }
            >
              <Wand2 /> Fill open shifts
            </DropdownItem>
            {locationId ? (
              <DropdownItem
                onSelect={() =>
                  go(
                    () => buildFromAvailabilityAction(weekStart, locationId),
                    (n) => `Drafted ${n} shifts from availability.`,
                  )
                }
              >
                <Sparkles /> Build week from availability
              </DropdownItem>
            ) : (
              <DropdownItem disabled>Pick a location to build from availability</DropdownItem>
            )}
          </DropdownContent>
        </Dropdown>
      ) : null}
      <Button
        disabled={busy || drafts === 0}
        onClick={() =>
          go(
            () => publishWeekAction(weekStart, locationId),
            (r) =>
              `Published ${r.published} shift${r.published === 1 ? "" : "s"}. ${r.notified} people notified.`,
          )
        }
      >
        <Send /> Publish{drafts ? ` (${drafts})` : ""}
      </Button>
    </div>
  );
}

"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { addUnavailableDateAction, removeAvailabilityAction, saveAvailabilityAction } from "@/app/me/actions";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/input";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type AvailabilityRow = { weekday: number; available: boolean; start: string; end: string };

export function AvailabilityEditor({
  initial,
  dates,
}: {
  initial: AvailabilityRow[];
  dates: { id: string; date: string; note: string | null }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<AvailabilityRow[]>(() =>
    DAYS.map(
      (_, i) =>
        initial.find((r) => r.weekday === i) ?? { weekday: i, available: true, start: "08:00", end: "22:00" },
    ),
  );
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<AvailabilityRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[7.5rem_1fr] items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={r.available} onChange={(e) => set(i, { available: e.target.checked })} />
              {DAYS[i]}
            </label>
            {r.available ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  aria-label={`${DAYS[i]} from`}
                  className="min-w-0 flex-1"
                  value={r.start}
                  onChange={(e) => set(i, { start: e.target.value })}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  aria-label={`${DAYS[i]} until`}
                  className="min-w-0 flex-1"
                  value={r.end}
                  onChange={(e) => set(i, { end: e.target.value })}
                />
              </div>
            ) : (
              <span className="text-muted-foreground">Not available</span>
            )}
          </div>
        ))}
      </div>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await saveAvailabilityAction(rows);
          setBusy(false);
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        }}
      >
        Save availability
      </Button>
      <div className="border-t pt-4">
        <p className="mb-2 text-sm font-medium">Days I can&apos;t work</p>
        <ul className="mb-3 space-y-1 text-sm">
          {dates.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-md border px-3 py-1.5">
              <span>
                {d.date} {d.note ? <span className="text-muted-foreground">· {d.note}</span> : null}
              </span>
              <button
                aria-label="Remove"
                className="text-muted-foreground"
                onClick={async () => {
                  await removeAvailabilityAction(d.id);
                  router.refresh();
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            type="date"
            aria-label="Unavailable date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="w-44"
          />
          <Button
            variant="outline"
            disabled={!newDate}
            onClick={async () => {
              const r = await addUnavailableDateAction(newDate, "");
              if (r.ok) {
                setNewDate("");
                router.refresh();
              } else toast.error(r.error);
            }}
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

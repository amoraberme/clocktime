"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { fileScheduleChangeAction } from "@/app/me/requests/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";

export type ShiftOption = {
  id: string;
  label: string;
  date: string;
  start: string;
  end: string;
  locationId: string;
};

/** Ask to move a shift, add a duty or take a day off; approved changes update the schedule. */
export function ScheduleChangeForm({
  shifts,
  locations,
  today,
}: {
  shifts: ShiftOption[];
  locations: { id: string; name: string }[];
  today: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"CHANGE" | "ADD" | "REMOVE">(shifts.length ? "CHANGE" : "ADD");
  const [shiftId, setShiftId] = useState(shifts[0]?.id ?? "");
  const shift = shifts.find((s) => s.id === shiftId);
  const [v, setV] = useState({
    date: today,
    start: shift?.start ?? "08:00",
    end: shift?.end ?? "17:00",
    locationId: shift?.locationId ?? locations[0]?.id ?? "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await fileScheduleChangeAction({
          kind,
          shiftId: kind === "ADD" ? null : shiftId,
          date: kind === "ADD" ? v.date : (shift?.date ?? v.date),
          start: kind === "REMOVE" ? null : v.start,
          end: kind === "REMOVE" ? null : v.end,
          locationId: v.locationId || null,
          reason: v.reason,
        });
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        toast.success(r.message);
        setV({ ...v, reason: "" });
        router.refresh();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Change" htmlFor="s-kind">
          <Select id="s-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {shifts.length ? <option value="CHANGE">Move a shift to other hours</option> : null}
            <option value="ADD">Add a duty</option>
            {shifts.length ? <option value="REMOVE">Day off (remove a shift)</option> : null}
          </Select>
        </Field>
        {kind !== "ADD" ? (
          <Field label="Shift" htmlFor="s-shift">
            <Select
              id="s-shift"
              value={shiftId}
              onChange={(e) => {
                setShiftId(e.target.value);
                const s = shifts.find((x) => x.id === e.target.value);
                if (s) setV({ ...v, start: s.start, end: s.end, locationId: s.locationId });
              }}
            >
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Date" htmlFor="s-date">
            <Input
              id="s-date"
              type="date"
              value={v.date}
              onChange={(e) => setV({ ...v, date: e.target.value })}
            />
          </Field>
        )}
        {kind !== "REMOVE" ? (
          <>
            <Field label="Start" htmlFor="s-start">
              <Input
                id="s-start"
                type="time"
                value={v.start}
                onChange={(e) => setV({ ...v, start: e.target.value })}
              />
            </Field>
            <Field label="End" htmlFor="s-end" hint="Earlier than the start = ends the next day">
              <Input
                id="s-end"
                type="time"
                value={v.end}
                onChange={(e) => setV({ ...v, end: e.target.value })}
              />
            </Field>
            {locations.length > 1 ? (
              <Field label="Branch" htmlFor="s-loc">
                <Select
                  id="s-loc"
                  value={v.locationId}
                  onChange={(e) => setV({ ...v, locationId: e.target.value })}
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </>
        ) : null}
      </div>
      <Field label="Reason" htmlFor="s-reason">
        <Input
          id="s-reason"
          value={v.reason}
          onChange={(e) => setV({ ...v, reason: e.target.value })}
          placeholder="e.g. Swapped with a colleague, medical appointment"
          required
        />
      </Field>
      <Button disabled={busy}>Send for approval</Button>
    </form>
  );
}

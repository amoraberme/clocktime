"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createShiftAction, deleteShiftAction, updateShiftAction } from "@/app/app/schedule/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";

export type ShiftFormDefaults = {
  id?: string;
  date: string;
  start: string;
  end: string;
  breakMinutes: number;
  employeeId: string | null;
  locationId: string;
  positionId: string | null;
  notes: string;
  recurring?: boolean;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ShiftDialog({
  defaults,
  onClose,
  employees,
  locations,
  positions,
  canOpenShifts,
  canRecurring,
}: {
  defaults: ShiftFormDefaults;
  onClose: () => void;
  employees: { id: string; firstName: string; lastName: string }[];
  locations: { id: string; name: string }[];
  positions: { id: string; name: string }[];
  canOpenShifts: boolean;
  canRecurring: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState(defaults);
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatUntil, setRepeatUntil] = useState("");
  const [scope, setScope] = useState<"one" | "future">("one");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = !!defaults.id;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = {
      ...form,
      employeeId: form.employeeId || null,
      positionId: form.positionId || null,
      repeatDays,
      repeatUntil: repeatUntil || null,
    };
    const r = editing ? await updateShiftAction(defaults.id!, data, scope) : await createShiftAction(data);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(
      editing
        ? "Shift updated"
        : typeof r.data === "number" && r.data > 1
          ? `${r.data} shifts created`
          : "Shift added",
    );
    router.refresh();
    onClose();
  }

  async function remove() {
    setBusy(true);
    const r = await deleteShiftAction(defaults.id!, scope);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(r.message);
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={editing ? "Edit shift" : "Add shift"} className="max-w-xl">
        <form onSubmit={submit} className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Who" htmlFor="emp">
            <Select
              id="emp"
              value={form.employeeId ?? ""}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value || null })}
            >
              {canOpenShifts ? (
                <option value="">Open shift (anyone can claim)</option>
              ) : (
                <option value="" disabled>
                  Choose someone
                </option>
              )}
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Date" htmlFor="date" className="col-span-2">
              <Input
                id="date"
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="Start" htmlFor="start">
              <Input
                id="start"
                type="time"
                required
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
            </Field>
            <Field label="End" htmlFor="end">
              <Input
                id="end"
                type="time"
                required
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Unpaid break (min)" htmlFor="break">
              <Input
                id="break"
                type="number"
                min={0}
                max={240}
                step={5}
                value={form.breakMinutes}
                onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })}
              />
            </Field>
            <Field label="Location" htmlFor="location">
              <Select
                id="location"
                value={form.locationId}
                onChange={(e) => setForm({ ...form, locationId: e.target.value })}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Position" htmlFor="position">
              <Select
                id="position"
                value={form.positionId ?? ""}
                onChange={(e) => setForm({ ...form, positionId: e.target.value || null })}
              >
                <option value="">—</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Note" htmlFor="notes">
            <Input
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Opening, inventory count"
            />
          </Field>
          {!editing && canRecurring ? (
            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">Repeat weekly</p>
              <div className="flex flex-wrap gap-3 text-sm">
                {WEEKDAYS.map((d, i) => (
                  <label key={d} className="flex items-center gap-1">
                    <Checkbox
                      checked={repeatDays.includes(i)}
                      onChange={(e) =>
                        setRepeatDays(
                          e.target.checked ? [...repeatDays, i] : repeatDays.filter((x) => x !== i),
                        )
                      }
                    />
                    {d}
                  </label>
                ))}
              </div>
              {repeatDays.length ? (
                <Field label="Until" htmlFor="until" hint="Defaults to 12 weeks" className="mt-3">
                  <Input
                    id="until"
                    type="date"
                    value={repeatUntil}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}
          {editing && defaults.recurring ? (
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={scope === "one"} onChange={() => setScope("one")} /> This shift
                only
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={scope === "future"} onChange={() => setScope("future")} /> This
                and following
              </label>
            </div>
          ) : null}
          <div className="flex justify-between gap-2">
            {editing ? (
              <Button type="button" variant="ghost" className="text-danger" onClick={remove} disabled={busy}>
                <Trash2 /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={busy}>{busy ? "Saving…" : "Save shift"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

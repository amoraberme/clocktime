"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteEntryAction, saveEntryAction } from "@/app/app/timesheets/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";

export type EntryDraft = {
  id?: string;
  clockIn: string;
  clockOut: string;
  locationId: string;
  notes: string;
  breaks: { start: string; end: string }[];
};

export function EntryDialog({
  employeeId,
  draft,
  locations,
  trigger,
}: {
  employeeId: string;
  draft: EntryDraft;
  locations: { id: string; name: string }[];
  trigger: "edit" | "add";
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(draft);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await saveEntryAction({
      entryId: form.id,
      employeeId,
      data: {
        clockIn: form.clockIn,
        clockOut: form.clockOut || undefined,
        locationId: form.locationId || undefined,
        notes: form.notes,
        breaks: form.breaks,
        reason,
      },
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(r.message);
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!form.id) return;
    if (reason.trim().length < 3) return setError("Enter a reason before deleting.");
    if (!confirm("Delete this time entry?")) return;
    setBusy(true);
    const r = await deleteEntryAction(form.id, reason);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(r.message);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setForm(draft);
          setReason("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger === "edit" ? (
          <Button variant="ghost" size="icon" aria-label="Edit entry">
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus /> Add entry
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={form.id ? "Edit time entry" : "Add a missed punch"}
        description="Every change is saved to the audit trail with your name and reason."
      >
        <form onSubmit={save} className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Clock in" htmlFor="clockIn">
              <Input
                id="clockIn"
                type="datetime-local"
                required
                value={form.clockIn}
                onChange={(e) => setForm({ ...form, clockIn: e.target.value })}
              />
            </Field>
            <Field label="Clock out" htmlFor="clockOut" hint="Leave empty if still on the clock">
              <Input
                id="clockOut"
                type="datetime-local"
                value={form.clockOut}
                onChange={(e) => setForm({ ...form, clockOut: e.target.value })}
              />
            </Field>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Unpaid breaks</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setForm({ ...form, breaks: [...form.breaks, { start: form.clockIn, end: form.clockIn }] })
                }
              >
                <Plus /> Add break
              </Button>
            </div>
            {form.breaks.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  aria-label="Break start"
                  value={b.start}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      breaks: form.breaks.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                    })
                  }
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="datetime-local"
                  aria-label="Break end"
                  value={b.end}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      breaks: form.breaks.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove break"
                  onClick={() => setForm({ ...form, breaks: form.breaks.filter((_, j) => j !== i) })}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {form.breaks.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No breaks recorded. A meal break is deducted automatically on long shifts.
              </p>
            ) : null}
          </div>
          {locations.length > 1 ? (
            <Field label="Location" htmlFor="loc">
              <Select
                id="loc"
                value={form.locationId}
                onChange={(e) => setForm({ ...form, locationId: e.target.value })}
              >
                <option value="">—</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Note" htmlFor="notes">
            <Input
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <Field label="Reason for change" htmlFor="reason">
            <Textarea
              id="reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Forgot to clock out, confirmed with supervisor"
            />
          </Field>
          <div className="flex items-center justify-between gap-2">
            {form.id ? (
              <Button type="button" variant="ghost" className="text-danger" onClick={remove} disabled={busy}>
                <Trash2 /> Delete
              </Button>
            ) : (
              <span />
            )}
            <Button disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

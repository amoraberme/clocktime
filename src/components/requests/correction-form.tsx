"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { fileCorrectionAction } from "@/app/me/requests/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";

export type EntryOption = { id: string; label: string };

const KINDS = [
  { value: "MISSING_OUT", label: "I forgot to clock out" },
  { value: "MISSING_IN", label: "I forgot to clock in" },
  { value: "WRONG_TIME", label: "A time is wrong" },
  { value: "MISSING_BREAK", label: "Add a break I took" },
  { value: "VOID", label: "Remove a duty (punched by mistake)" },
] as const;

/** File an attendance correction; it goes to the supervisor/HR and, once approved, fixes the timesheet. */
export function CorrectionForm({
  entries,
  forEmployeeId,
}: {
  entries: EntryOption[];
  forEmployeeId?: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("MISSING_OUT");
  const [entryId, setEntryId] = useState(entries[0]?.id ?? "");
  const [v, setV] = useState({ clockIn: "", clockOut: "", breakStart: "", breakEnd: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const needsEntry = kind === "WRONG_TIME" || kind === "VOID" || kind === "MISSING_OUT";
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await fileCorrectionAction(
          {
            kind,
            timeEntryId: needsEntry ? entryId || null : null,
            clockIn: kind === "MISSING_IN" || kind === "WRONG_TIME" ? v.clockIn : null,
            clockOut: kind === "MISSING_OUT" || kind === "WRONG_TIME" ? v.clockOut : null,
            breakStart: kind === "MISSING_BREAK" ? v.breakStart : null,
            breakEnd: kind === "MISSING_BREAK" ? v.breakEnd : null,
            reason: v.reason,
          },
          forEmployeeId,
        );
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        toast.success(r.message);
        setV({ clockIn: "", clockOut: "", breakStart: "", breakEnd: "", reason: "" });
        router.refresh();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What happened?" htmlFor="c-kind">
          <Select id="c-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        {needsEntry ? (
          <Field label="Which duty?" htmlFor="c-entry">
            <Select id="c-entry" value={entryId} onChange={(e) => setEntryId(e.target.value)}>
              {kind === "MISSING_OUT" ? <option value="">Not listed</option> : null}
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {kind === "MISSING_IN" || kind === "WRONG_TIME" ? (
          <Field
            label={kind === "WRONG_TIME" ? "Correct clock-in (optional)" : "Clock-in time"}
            htmlFor="c-in"
          >
            <Input
              id="c-in"
              type="datetime-local"
              value={v.clockIn}
              onChange={(e) => setV({ ...v, clockIn: e.target.value })}
              required={kind === "MISSING_IN"}
            />
          </Field>
        ) : null}
        {kind === "MISSING_OUT" || kind === "WRONG_TIME" ? (
          <Field
            label={kind === "WRONG_TIME" ? "Correct clock-out (optional)" : "Clock-out time"}
            htmlFor="c-out"
          >
            <Input
              id="c-out"
              type="datetime-local"
              value={v.clockOut}
              onChange={(e) => setV({ ...v, clockOut: e.target.value })}
              required={kind === "MISSING_OUT"}
            />
          </Field>
        ) : null}
        {kind === "MISSING_BREAK" ? (
          <>
            <Field label="Break started" htmlFor="c-bs">
              <Input
                id="c-bs"
                type="datetime-local"
                value={v.breakStart}
                onChange={(e) => setV({ ...v, breakStart: e.target.value })}
                required
              />
            </Field>
            <Field label="Break ended" htmlFor="c-be">
              <Input
                id="c-be"
                type="datetime-local"
                value={v.breakEnd}
                onChange={(e) => setV({ ...v, breakEnd: e.target.value })}
                required
              />
            </Field>
          </>
        ) : null}
      </div>
      <Field label="Reason" htmlFor="c-reason">
        <Input
          id="c-reason"
          value={v.reason}
          onChange={(e) => setV({ ...v, reason: e.target.value })}
          placeholder="e.g. The terminal was offline when I left"
          required
        />
      </Field>
      <Button disabled={busy}>Send for approval</Button>
    </form>
  );
}

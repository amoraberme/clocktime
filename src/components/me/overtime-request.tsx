"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { requestOvertimeAction } from "@/app/me/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function OvertimeRequestForm({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [hours, setHours] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await requestOvertimeAction({ date, minutes: Math.round(Number(hours) * 60), reason });
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        toast.success(r.message);
        setReason("");
        router.refresh();
      }}
    >
      <Field label="Date" htmlFor="ot-date">
        <Input id="ot-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </Field>
      <Field label="Hours" htmlFor="ot-hours">
        <Input
          id="ot-hours"
          type="number"
          step="0.25"
          min="0.25"
          max="16"
          className="w-24"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          required
        />
      </Field>
      <Field label="Reason" htmlFor="ot-reason">
        <Input
          id="ot-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Covered closing"
          required
        />
      </Field>
      <Button disabled={busy}>Request</Button>
    </form>
  );
}

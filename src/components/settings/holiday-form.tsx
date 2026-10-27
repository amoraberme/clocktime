"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { addHolidayAction, deleteHolidayAction } from "@/app/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";

export function AddHolidayForm() {
  const router = useRouter();
  const [v, setV] = useState({ date: "", name: "", type: "SPECIAL_NON_WORKING" });
  return (
    <form
      className="grid gap-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await addHolidayAction(v);
        if (!r.ok) return toast.error(r.error);
        toast.success(r.message);
        setV({ date: "", name: "", type: "SPECIAL_NON_WORKING" });
        router.refresh();
      }}
    >
      <Field label="Date" htmlFor="h-date">
        <Input
          id="h-date"
          type="date"
          required
          value={v.date}
          onChange={(e) => setV({ ...v, date: e.target.value })}
        />
      </Field>
      <Field label="Name" htmlFor="h-name">
        <Input
          id="h-name"
          required
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          placeholder="e.g. Quezon City Day"
        />
      </Field>
      <Field label="Type" htmlFor="h-type">
        <Select id="h-type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
          <option value="REGULAR">Regular holiday (200%)</option>
          <option value="SPECIAL_NON_WORKING">Special non-working (130%)</option>
          <option value="SPECIAL_WORKING">Special working (ordinary pay)</option>
        </Select>
      </Field>
      <Button>Add</Button>
    </form>
  );
}

export function DeleteHolidayButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Remove holiday"
      onClick={async () => {
        const r = await deleteHolidayAction(id);
        if (r.ok) router.refresh();
        else toast.error(r.error);
      }}
    >
      <Trash2 />
    </Button>
  );
}

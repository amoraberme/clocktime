"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteRegionAction, saveRegionAction } from "@/app/app/settings/regions/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

export function RegionForm({
  id = null,
  initial = { name: "", code: "" },
  onDone,
}: {
  id?: string | null;
  initial?: { name: string; code: string };
  onDone?: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await saveRegionAction(id, v);
        if (!r.ok) return toast.error(r.error);
        toast.success(r.message);
        if (!id) setV({ name: "", code: "" });
        router.refresh();
        onDone?.();
      }}
    >
      <Field label="Name" htmlFor={`r-name-${id ?? "new"}`}>
        <Input
          id={`r-name-${id ?? "new"}`}
          required
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          placeholder="e.g. Visayas"
        />
      </Field>
      <Field label="Code" htmlFor={`r-code-${id ?? "new"}`}>
        <Input
          id={`r-code-${id ?? "new"}`}
          value={v.code}
          onChange={(e) => setV({ ...v, code: e.target.value })}
          placeholder="VIS"
        />
      </Field>
      <Button>{id ? "Save" : "Add"}</Button>
    </form>
  );
}

export function RegionRow({ id, name, code }: { id: string; name: string; code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" aria-label={`Edit ${name}`} onClick={() => setOpen(true)}>
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${name}`}
        onClick={async () => {
          if (!confirm(`Remove the ${name} region? Its branches stay, without a region.`)) return;
          const r = await deleteRegionAction(id);
          if (!r.ok) return toast.error(r.error);
          toast.success(r.message);
          router.refresh();
        }}
      >
        <Trash2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Edit ${name}`}>
          <RegionForm id={id} initial={{ name, code }} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

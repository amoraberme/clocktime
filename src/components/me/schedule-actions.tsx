"use client";

import { ArrowLeftRight, Check, Hand, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  cancelSwapAction,
  claimShiftAction,
  confirmShiftAction,
  requestSwapAction,
  respondSwapAction,
} from "@/app/me/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    act: async (fn: () => Promise<Result>) => {
      setBusy(true);
      const r = await fn();
      setBusy(false);
      if (r.ok) {
        toast.success(r.message ?? "Done");
        router.refresh();
      } else toast.error(r.error);
      return r.ok;
    },
  };
}

export function ConfirmShiftButton({ id }: { id: string }) {
  const { busy, act } = useAct();
  return (
    <Button size="sm" disabled={busy} onClick={() => act(() => confirmShiftAction(id))}>
      <Check /> Confirm
    </Button>
  );
}

export function ClaimShiftButton({ id }: { id: string }) {
  const { busy, act } = useAct();
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => claimShiftAction(id))}>
      <Hand /> Pick up
    </Button>
  );
}

export function IncomingSwapButtons({ id }: { id: string }) {
  const { busy, act } = useAct();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={busy} onClick={() => act(() => respondSwapAction(id, true))}>
        <Check /> Accept
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => act(() => respondSwapAction(id, false))}
      >
        <X /> Decline
      </Button>
    </div>
  );
}

export function CancelSwapButton({ id }: { id: string }) {
  const { busy, act } = useAct();
  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => cancelSwapAction(id))}>
      Cancel request
    </Button>
  );
}

export function SwapDialog({
  shiftId,
  colleagues,
}: {
  shiftId: string;
  colleagues: { id: string; name: string; shifts: { id: string; label: string }[] }[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"give" | "trade" | "drop">("give");
  const [target, setTarget] = useState("");
  const [targetShift, setTargetShift] = useState("");
  const [note, setNote] = useState("");
  const { busy, act } = useAct();
  const targetShifts = colleagues.find((c) => c.id === target)?.shifts ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ArrowLeftRight /> Swap
        </Button>
      </DialogTrigger>
      <DialogContent title="Swap or give away this shift" description="Your manager approves every change.">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act(() =>
              requestSwapAction(shiftId, {
                targetEmployeeId: mode === "drop" ? null : target,
                targetShiftId: mode === "trade" ? targetShift : null,
                note,
              }),
            );
            if (ok) setOpen(false);
          }}
        >
          <div className="grid grid-cols-3 gap-2 text-sm">
            {(
              [
                ["give", "Give to a colleague"],
                ["trade", "Trade shifts"],
                ["drop", "Release to open"],
              ] as const
            ).map(([m, label]) => (
              <label
                key={m}
                className={`cursor-pointer rounded-md border px-2 py-2 text-center ${mode === m ? "border-primary bg-primary-soft text-primary" : ""}`}
              >
                <input type="radio" className="sr-only" checked={mode === m} onChange={() => setMode(m)} />
                {label}
              </label>
            ))}
          </div>
          {mode !== "drop" ? (
            <Field label="Colleague" htmlFor="target">
              <Select id="target" required value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose…</option>
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {mode === "trade" && target ? (
            <Field label="Their shift you'll take" htmlFor="targetShift">
              <Select
                id="targetShift"
                required
                value={targetShift}
                onChange={(e) => setTargetShift(e.target.value)}
              >
                <option value="">Choose…</option>
                {targetShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Message (optional)" htmlFor="note">
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button className="w-full" disabled={busy}>
            Send request
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

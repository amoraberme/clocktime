"use client";

import { Archive, KeyRound, Mail, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  archiveEmployeeAction,
  resendInviteAction,
  restoreEmployeeAction,
  setPinAction,
} from "@/app/app/team/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

export function EmployeeActions({
  id,
  status,
  hasEmail,
  hasUser,
  hasPin,
  canArchive,
}: {
  id: string;
  status: string;
  hasEmail: boolean;
  hasUser: boolean;
  hasPin: boolean;
  canArchive: boolean;
}) {
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function act<T>(fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: T }>) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) toast.success(r.message ?? "Done");
    else toast.error(r.error);
    return r.ok;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {hasEmail && !hasUser && status !== "ARCHIVED" ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => resendInviteAction(id))}>
          <Mail /> Resend invite
        </Button>
      ) : null}
      {status !== "ARCHIVED" ? (
        <Dialog open={pinOpen} onOpenChange={setPinOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <KeyRound /> {hasPin ? "Change kiosk PIN" : "Set kiosk PIN"}
            </Button>
          </DialogTrigger>
          <DialogContent
            title="Kiosk PIN"
            description="4–6 digits, used to punch on a shared tablet. Each person needs a different PIN."
          >
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await act(() => setPinAction(id, pin))) {
                  setPinOpen(false);
                  setPin("");
                }
              }}
            >
              <Field label="New PIN" htmlFor="pin">
                <Input
                  id="pin"
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  className="text-center font-mono text-xl tracking-[0.5em]"
                  autoComplete="off"
                  required
                />
              </Field>
              <Button className="w-full" disabled={busy || pin.length < 4}>
                Save PIN
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {canArchive ? (
        status === "ARCHIVED" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => act(() => restoreEmployeeAction(id))}
          >
            <RotateCcw /> Restore
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            disabled={busy}
            onClick={() =>
              confirm("Archive this person? They won't be able to clock in. Their history is kept.") &&
              act(() => archiveEmployeeAction(id))
            }
          >
            <Archive /> Archive
          </Button>
        )
      ) : null}
    </div>
  );
}

"use client";

import { Check, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  cancelLeaveAction,
  createLeaveTypeAction,
  decideLeaveAction,
  requestLeaveAction,
  setEntitlementAction,
} from "@/app/app/leave/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";

type R = { ok: boolean; error?: string; message?: string };

function useGo() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    go: async (fn: () => Promise<R>) => {
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

export function LeaveRequestForm({
  types,
  employees,
  defaultDate,
}: {
  types: { id: string; name: string; remaining: number | null }[];
  employees?: { id: string; name: string }[];
  defaultDate: string;
}) {
  const [v, setV] = useState({
    leaveTypeId: types[0]?.id ?? "",
    startDate: defaultDate,
    endDate: defaultDate,
    halfDay: false,
    reason: "",
    employeeId: "",
  });
  const [error, setError] = useState<string | null>(null);
  const { busy, go } = useGo();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const { employeeId, ...data } = v;
        const ok = await go(async () => {
          const r = await requestLeaveAction(data, employees ? employeeId : undefined);
          if (!r.ok) setError(r.error);
          return r;
        });
        if (ok) setV({ ...v, reason: "" });
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {employees ? (
        <Field label="Employee" htmlFor="lv-emp">
          <Select
            id="lv-emp"
            required
            value={v.employeeId}
            onChange={(e) => setV({ ...v, employeeId: e.target.value })}
          >
            <option value="">Choose…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Type" htmlFor="lv-type">
        <Select
          id="lv-type"
          value={v.leaveTypeId}
          onChange={(e) => setV({ ...v, leaveTypeId: e.target.value })}
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.remaining != null ? ` (${t.remaining} left)` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" htmlFor="lv-start">
          <Input
            id="lv-start"
            type="date"
            required
            value={v.startDate}
            onChange={(e) =>
              setV({
                ...v,
                startDate: e.target.value,
                endDate: e.target.value > v.endDate ? e.target.value : v.endDate,
              })
            }
          />
        </Field>
        <Field label="To" htmlFor="lv-end">
          <Input
            id="lv-end"
            type="date"
            required
            value={v.endDate}
            onChange={(e) => setV({ ...v, endDate: e.target.value })}
          />
        </Field>
      </div>
      {v.startDate === v.endDate ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={v.halfDay} onChange={(e) => setV({ ...v, halfDay: e.target.checked })} /> Half
          day
        </label>
      ) : null}
      <Field label="Reason (optional)" htmlFor="lv-reason">
        <Input id="lv-reason" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />
      </Field>
      <Button className="w-full" disabled={busy}>
        {employees ? "Record leave" : "Send request"}
      </Button>
    </form>
  );
}

export function DecideLeave({ id }: { id: string }) {
  const { busy, go } = useGo();
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" disabled={busy} onClick={() => go(() => decideLeaveAction(id, true))}>
        <Check /> Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => go(() => decideLeaveAction(id, false))}
      >
        <X /> Decline
      </Button>
    </div>
  );
}

export function CancelLeave({ id }: { id: string }) {
  const { busy, go } = useGo();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={() => confirm("Cancel this leave?") && go(() => cancelLeaveAction(id))}
    >
      Cancel
    </Button>
  );
}

export function AddLeaveType() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", code: "", paid: true, annualDays: 0 });
  const { busy, go } = useGo();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus /> Leave type
        </Button>
      </DialogTrigger>
      <DialogContent title="New leave type" description="e.g. Bereavement, Birthday leave, Emergency leave">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await go(() => createLeaveTypeAction(v))) setOpen(false);
          }}
        >
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field label="Name" htmlFor="lt-name">
              <Input
                id="lt-name"
                required
                value={v.name}
                onChange={(e) => setV({ ...v, name: e.target.value })}
              />
            </Field>
            <Field label="Code" htmlFor="lt-code">
              <Input
                id="lt-code"
                required
                maxLength={6}
                value={v.code}
                onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })}
              />
            </Field>
          </div>
          <Field label="Days per year" htmlFor="lt-days" hint="0 = not tracked">
            <Input
              id="lt-days"
              type="number"
              min={0}
              step={0.5}
              value={v.annualDays}
              onChange={(e) => setV({ ...v, annualDays: Number(e.target.value) })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={v.paid} onChange={(e) => setV({ ...v, paid: e.target.checked })} /> Paid leave
          </label>
          <Button className="w-full" disabled={busy}>
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EntitlementInput({
  employeeId,
  leaveTypeId,
  year,
  value,
}: {
  employeeId: string;
  leaveTypeId: string;
  year: number;
  value: number;
}) {
  const [v, setV] = useState(String(value));
  const { go } = useGo();
  return (
    <Input
      aria-label="Entitled days"
      className="h-8 w-16 text-right"
      type="number"
      step={0.5}
      min={0}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() =>
        Number(v) !== value && go(() => setEntitlementAction(employeeId, leaveTypeId, year, Number(v)))
      }
    />
  );
}

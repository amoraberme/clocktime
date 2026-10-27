"use client";

import { CheckCircle2, Lock, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  addAdjustmentAction,
  cancelLoanAction,
  createLoanAction,
  createRunAction,
  createYearEndAction,
  deleteRunAction,
  finalizeAction,
  markPaidAction,
  recomputeAction,
  removeAdjustmentAction,
} from "@/app/app/payroll/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";

type R<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

function useGo() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    router,
    go: async <T,>(fn: () => Promise<R<T>>) => {
      setBusy(true);
      const r = await fn();
      setBusy(false);
      if (!r.ok) {
        toast.error(r.error);
        return null;
      }
      if (r.message) toast.success(r.message);
      router.refresh();
      return r;
    },
  };
}

export function NewRunDialog({
  periods,
  year,
}: {
  periods: { date: string; label: string }[];
  year: number;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(periods[0]?.date ?? "");
  const [payDate, setPayDate] = useState(`${year}-12-15`);
  const { busy, go, router } = useGo();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Run payroll
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Run payroll"
        description="We'll calculate pay from timesheets, premiums, contributions and tax. Nothing is final until you finalize."
      >
        <div className="space-y-4">
          <Field label="Pay period" htmlFor="pr-period">
            <Select id="pr-period" value={date} onChange={(e) => setDate(e.target.value)}>
              {periods.map((p) => (
                <option key={p.date} value={p.date}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            className="w-full"
            disabled={busy}
            onClick={async () => {
              const r = await go(() => createRunAction(date));
              if (r?.data) router.push(`/app/payroll/${r.data}`);
            }}
          >
            {busy ? "Calculating…" : "Calculate payroll"}
          </Button>
          <div className="border-t pt-4">
            <p className="mb-2 text-sm font-medium">Year-end: 13th-month pay & SIL conversion ({year})</p>
            <div className="flex gap-2">
              <Input
                type="date"
                aria-label="13th month pay date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  const r = await go(() => createYearEndAction(year, payDate));
                  if (r?.data) router.push(`/app/payroll/${r.data}`);
                }}
              >
                Calculate
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RunActions({ id, status }: { id: string; status: string }) {
  const { busy, go, router } = useGo();
  return (
    <div className="flex flex-wrap gap-2">
      {status === "COMPUTED" || status === "DRAFT" ? (
        <>
          <Button
            variant="ghost"
            className="text-danger"
            disabled={busy}
            onClick={async () =>
              confirm("Delete this draft pay run?") &&
              (await go(() => deleteRunAction(id))) &&
              router.push("/app/payroll")
            }
          >
            <Trash2 /> Delete draft
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => go(() => recomputeAction(id))}>
            <RefreshCw /> Recalculate
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              confirm(
                "Finalize payroll? Timesheets for this period will be locked and payslips generated.",
              ) && go(() => finalizeAction(id))
            }
          >
            <Lock /> Finalize
          </Button>
        </>
      ) : null}
      {status === "FINALIZED" ? (
        <>
          <Button variant="outline" disabled={busy} onClick={() => go(() => markPaidAction(id, false))}>
            <CheckCircle2 /> Mark as paid
          </Button>
          <Button disabled={busy} onClick={() => go(() => markPaidAction(id, true))}>
            <Send /> Mark paid & email payslips
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function AdjustmentDialog({
  runId,
  employees,
}: {
  runId: string;
  employees: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    employeeId: employees[0]?.id ?? "",
    kind: "ALLOWANCE",
    label: "",
    amount: "",
    taxable: false,
    recurring: false,
  });
  const { busy, go } = useGo();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> Adjustment
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add a pay adjustment"
        description="Allowances, bonuses, reimbursements or deductions for this pay run."
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await go(() => addAdjustmentAction(runId, v))) setOpen(false);
          }}
        >
          <Field label="Employee" htmlFor="adj-emp">
            <Select
              id="adj-emp"
              value={v.employeeId}
              onChange={(e) => setV({ ...v, employeeId: e.target.value })}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="adj-kind">
              <Select
                id="adj-kind"
                value={v.kind}
                onChange={(e) =>
                  setV({
                    ...v,
                    kind: e.target.value,
                    taxable: e.target.value === "BONUS" ? v.taxable : false,
                  })
                }
              >
                <option value="ALLOWANCE">Allowance</option>
                <option value="BONUS">Bonus</option>
                <option value="REIMBURSEMENT">Reimbursement</option>
                <option value="DEDUCTION">Deduction</option>
              </Select>
            </Field>
            <Field label="Amount (₱)" htmlFor="adj-amt">
              <Input
                id="adj-amt"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={v.amount}
                onChange={(e) => setV({ ...v, amount: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="adj-label">
            <Input
              id="adj-label"
              required
              value={v.label}
              onChange={(e) => setV({ ...v, label: e.target.value })}
              placeholder="e.g. Transportation allowance"
            />
          </Field>
          {v.kind !== "DEDUCTION" && v.kind !== "REIMBURSEMENT" ? (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={v.taxable} onChange={(e) => setV({ ...v, taxable: e.target.checked })} />
              <span>
                Taxable
                <span className="text-muted-foreground block text-xs">
                  De minimis benefits and bonuses within the ₱90,000 yearly exemption are not taxable.
                </span>
              </span>
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={v.recurring} onChange={(e) => setV({ ...v, recurring: e.target.checked })} />{" "}
            Repeat every payday
          </label>
          <Button className="w-full" disabled={busy}>
            Add & recalculate
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveAdjustment({ id, runId }: { id: string; runId: string }) {
  const { busy, go } = useGo();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Remove adjustment"
      disabled={busy}
      onClick={() => go(() => removeAdjustmentAction(id, runId))}
    >
      <X />
    </Button>
  );
}

export function LoanForm({ employees, today }: { employees: { id: string; name: string }[]; today: string }) {
  const [v, setV] = useState({
    employeeId: employees[0]?.id ?? "",
    label: "Cash advance",
    principal: "",
    amortization: "",
    startDate: today,
  });
  const { busy, go } = useGo();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await go(() => createLoanAction(v))) setV({ ...v, principal: "", amortization: "" });
      }}
    >
      <Field label="Employee" htmlFor="ln-emp" className="lg:col-span-2">
        <Select id="ln-emp" value={v.employeeId} onChange={(e) => setV({ ...v, employeeId: e.target.value })}>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Description" htmlFor="ln-label">
        <Input id="ln-label" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} />
      </Field>
      <Field label="Amount (₱)" htmlFor="ln-amt">
        <Input
          id="ln-amt"
          type="number"
          min="1"
          step="0.01"
          required
          value={v.principal}
          onChange={(e) => setV({ ...v, principal: e.target.value })}
        />
      </Field>
      <Field label="Per payday (₱)" htmlFor="ln-per">
        <Input
          id="ln-per"
          type="number"
          min="1"
          step="0.01"
          required
          value={v.amortization}
          onChange={(e) => setV({ ...v, amortization: e.target.value })}
        />
      </Field>
      <Button disabled={busy}>Add loan</Button>
    </form>
  );
}

export function CancelLoan({ id }: { id: string }) {
  const { busy, go } = useGo();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={() => confirm("Cancel the remaining balance?") && go(() => cancelLoanAction(id))}
    >
      Cancel
    </Button>
  );
}

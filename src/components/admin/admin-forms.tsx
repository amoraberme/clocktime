"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  addNationalHolidayAction,
  deleteNationalHolidayAction,
  loadFixedHolidaysAction,
  saveStatutoryAction,
  setCompanyPlanAction,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

type R = { ok: boolean; error?: string; message?: string };
function useGo() {
  const router = useRouter();
  return async (fn: () => Promise<R>) => {
    const r = await fn();
    if (r.ok) {
      toast.success(r.message ?? "Done");
      router.refresh();
    } else toast.error(r.error);
    return r.ok;
  };
}

export function CompanyPlanDialog({
  id,
  name,
  values,
}: {
  id: string;
  name: string;
  values: { plan: string; planStatus: string; paidThrough: string | null; trialEndsAt: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(values);
  const go = useGo();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Manage
        </Button>
      </DialogTrigger>
      <DialogContent
        title={name}
        description="Use for bank-transfer payments, comps and support cases. Changes are audited."
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await go(() =>
                setCompanyPlanAction(id, {
                  ...v,
                  paidThrough: v.paidThrough || null,
                  trialEndsAt: v.trialEndsAt || null,
                }),
              )
            )
              setOpen(false);
          }}
        >
          <Field label="Plan" htmlFor="a-plan">
            <Select id="a-plan" value={v.plan} onChange={(e) => setV({ ...v, plan: e.target.value })}>
              <option>FREE</option>
              <option>STARTER</option>
              <option>PRO</option>
              <option>ENTERPRISE</option>
            </Select>
          </Field>
          <Field label="Status" htmlFor="a-status">
            <Select
              id="a-status"
              value={v.planStatus}
              onChange={(e) => setV({ ...v, planStatus: e.target.value })}
            >
              <option>TRIALING</option>
              <option>ACTIVE</option>
              <option>PAST_DUE</option>
              <option>CANCELED</option>
            </Select>
          </Field>
          <Field label="Paid through" htmlFor="a-paid">
            <Input
              id="a-paid"
              type="date"
              value={v.paidThrough ?? ""}
              onChange={(e) => setV({ ...v, paidThrough: e.target.value })}
            />
          </Field>
          <Field label="Trial ends" htmlFor="a-trial">
            <Input
              id="a-trial"
              type="date"
              value={v.trialEndsAt ?? ""}
              onChange={(e) => setV({ ...v, trialEndsAt: e.target.value })}
            />
          </Field>
          <Button className="sm:col-span-2">Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StatutoryForm({ kinds, defaults }: { kinds: string[]; defaults: Record<string, string> }) {
  const [kind, setKind] = useState(kinds[0]!);
  const [v, setV] = useState({
    effectiveFrom: "",
    version: "",
    source: "",
    json: defaults[kinds[0]!] ?? "{}",
  });
  const go = useGo();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await go(() => saveStatutoryAction({ kind, ...v }));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Table" htmlFor="st-kind">
          <Select
            id="st-kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setV({ ...v, json: defaults[e.target.value] ?? "{}" });
            }}
          >
            {kinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
        <Field label="Effective from" htmlFor="st-eff">
          <Input
            id="st-eff"
            type="date"
            required
            value={v.effectiveFrom}
            onChange={(e) => setV({ ...v, effectiveFrom: e.target.value })}
          />
        </Field>
        <Field label="Version label" htmlFor="st-ver">
          <Input
            id="st-ver"
            required
            value={v.version}
            onChange={(e) => setV({ ...v, version: e.target.value })}
            placeholder="SSS 2027 (16%)"
          />
        </Field>
        <Field label="Source / circular" htmlFor="st-src">
          <Input id="st-src" value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} />
        </Field>
      </div>
      <Field label="Data (JSON, amounts in centavos, rates as decimals)" htmlFor="st-json">
        <Textarea
          id="st-json"
          className="min-h-72 font-mono text-xs"
          value={v.json}
          onChange={(e) => setV({ ...v, json: e.target.value })}
        />
      </Field>
      <Button>Validate & save</Button>
    </form>
  );
}

export function HolidayAdmin({ year }: { year: number }) {
  const [v, setV] = useState({ date: "", name: "", type: "REGULAR" });
  const go = useGo();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Date" htmlFor="nh-date">
        <Input
          id="nh-date"
          type="date"
          value={v.date}
          onChange={(e) => setV({ ...v, date: e.target.value })}
        />
      </Field>
      <Field label="Name" htmlFor="nh-name" className="min-w-56 flex-1">
        <Input id="nh-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label="Type" htmlFor="nh-type">
        <Select id="nh-type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
          <option value="REGULAR">Regular</option>
          <option value="SPECIAL_NON_WORKING">Special non-working</option>
          <option value="SPECIAL_WORKING">Special working</option>
        </Select>
      </Field>
      <Button onClick={() => go(() => addNationalHolidayAction(v))}>Add</Button>
      <Button variant="outline" onClick={() => go(() => loadFixedHolidaysAction(year))}>
        Load fixed-date holidays for {year}
      </Button>
    </div>
  );
}

export function DeleteNationalHoliday({ id }: { id: string }) {
  const go = useGo();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-danger"
      onClick={() => confirm("Remove for every company?") && go(() => deleteNationalHolidayAction(id))}
    >
      Remove
    </Button>
  );
}

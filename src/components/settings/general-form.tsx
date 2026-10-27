"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveGeneralAction } from "@/app/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";

export function GeneralForm({
  values,
}: {
  values: { name: string; industry: string; timezone: string; payFrequency: string };
}) {
  const router = useRouter();
  const [v, setV] = useState(values);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Company</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-5 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await saveGeneralAction(v);
            setBusy(false);
            if (r.ok) {
              toast.success(r.message);
              router.refresh();
            } else toast.error(r.error);
          }}
        >
          <Field label="Business name" htmlFor="g-name">
            <Input id="g-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Industry" htmlFor="g-ind">
            <Input id="g-ind" value={v.industry} onChange={(e) => setV({ ...v, industry: e.target.value })} />
          </Field>
          <Field label="Time zone" htmlFor="g-tz" hint="All times are shown and paid in this zone">
            <Select id="g-tz" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>
              {["Asia/Manila", "Asia/Singapore", "Asia/Tokyo", "Asia/Dubai", "UTC"].map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </Select>
          </Field>
          <Field label="Pay schedule" htmlFor="g-pf">
            <Select
              id="g-pf"
              value={v.payFrequency}
              onChange={(e) => setV({ ...v, payFrequency: e.target.value })}
            >
              <option value="SEMI_MONTHLY">Semi-monthly (1–15, 16–end)</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Button disabled={busy}>Save</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

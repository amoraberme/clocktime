"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveSettingsAction } from "@/app/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export type SettingField =
  | {
      key: string;
      label: string;
      hint?: string;
      type: "number";
      min?: number;
      max?: number;
      step?: number;
      suffix?: string;
    }
  | { key: string; label: string; hint?: string; type: "boolean" }
  | {
      key: string;
      label: string;
      hint?: string;
      type: "select";
      options: { value: string; label: string }[];
      numeric?: boolean;
    }
  | { key: string; label: string; hint?: string; type: "time" };

function toHHMM(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function SettingsForm({
  title,
  fields,
  values,
}: {
  title: string;
  fields: SettingField[];
  values: Record<string, unknown>;
}) {
  const router = useRouter();
  const [state, setState] = useState(values);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await saveSettingsAction(state);
            setBusy(false);
            if (r.ok) {
              toast.success(r.message);
              router.refresh();
            } else toast.error(r.error);
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {fields.map((f) => {
              const id = `s-${f.key}`;
              if (f.type === "boolean") {
                return (
                  <label
                    key={f.key}
                    className="flex items-start justify-between gap-4 rounded-md border p-3 text-sm sm:col-span-2"
                  >
                    <span>
                      <span className="font-medium">{f.label}</span>
                      {f.hint ? <span className="text-muted-foreground block text-xs">{f.hint}</span> : null}
                    </span>
                    <Switch
                      checked={Boolean(state[f.key])}
                      onCheckedChange={(c) => setState({ ...state, [f.key]: c })}
                    />
                  </label>
                );
              }
              if (f.type === "select") {
                return (
                  <Field key={f.key} label={f.label} hint={f.hint} htmlFor={id}>
                    <Select
                      id={id}
                      value={String(state[f.key])}
                      onChange={(e) =>
                        setState({ ...state, [f.key]: f.numeric ? Number(e.target.value) : e.target.value })
                      }
                    >
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                );
              }
              if (f.type === "time") {
                return (
                  <Field key={f.key} label={f.label} hint={f.hint} htmlFor={id}>
                    <Input
                      id={id}
                      type="time"
                      value={toHHMM(Number(state[f.key]))}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(":").map(Number);
                        setState({ ...state, [f.key]: (h ?? 0) * 60 + (m ?? 0) });
                      }}
                    />
                  </Field>
                );
              }
              return (
                <Field
                  key={f.key}
                  label={f.label + (f.suffix ? ` (${f.suffix})` : "")}
                  hint={f.hint}
                  htmlFor={id}
                >
                  <Input
                    id={id}
                    type="number"
                    min={f.min}
                    max={f.max}
                    step={f.step ?? 1}
                    value={String(state[f.key])}
                    onChange={(e) => setState({ ...state, [f.key]: Number(e.target.value) })}
                  />
                </Field>
              );
            })}
          </div>
          <Button disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

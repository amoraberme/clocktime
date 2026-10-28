"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveSettingsAction } from "@/app/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
      <form
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
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2">
            {fields.map((f) => {
              const id = `s-${f.key}`;
              if (f.type === "boolean") {
                return (
                  <label
                    key={f.key}
                    className="flex items-start justify-between gap-4 rounded-xl border border-border/80 bg-muted/30 p-4 text-sm sm:col-span-2 transition-colors hover:bg-muted/50"
                  >
                    <span>
                      <span className="font-semibold text-foreground">{f.label}</span>
                      {f.hint ? <span className="mt-1 block text-xs text-muted-foreground leading-normal">{f.hint}</span> : null}
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
                      value={toHHMM(Number(state[f.key] ?? 0))}
                      onChange={(e) => {
                        const [h = "0", m = "0"] = e.target.value.split(":");
                        setState({ ...state, [f.key]: Number(h) * 60 + Number(m) });
                      }}
                    />
                  </Field>
                );
              }
              return (
                <Field key={f.key} label={f.label} hint={f.hint} htmlFor={id}>
                  <div className="flex items-center gap-2">
                    <Input
                      id={id}
                      type="number"
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      value={String(state[f.key] ?? "")}
                      onChange={(e) => setState({ ...state, [f.key]: Number(e.target.value) })}
                    />
                    {f.suffix ? <span className="text-xs font-medium text-muted-foreground">{f.suffix}</span> : null}
                  </div>
                </Field>
              );
            })}
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Changes take effect immediately</span>
          <Button disabled={busy} size="sm">Save changes</Button>
        </CardFooter>
      </form>
    </Card>
  );
}

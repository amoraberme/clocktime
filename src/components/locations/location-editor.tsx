"use client";

import { Archive, LocateFixed, Lock } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { archiveLocationAction, saveLocationAction } from "@/app/app/locations/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";

const GeofenceMap = dynamic(() => import("./geofence-map"), {
  ssr: false,
  loading: () => <div className="bg-muted h-72 animate-pulse rounded-md" />,
});

export type LocationValues = {
  id?: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  geofenceMode: "OFF" | "WARN" | "BLOCK";
  autoClockOut: boolean;
  allowedIps: string[];
  requirePhoto: boolean;
  code: string;
  regionId: string | null;
};

export function LocationEditor({
  initial,
  features,
  regions = [],
  onSaved,
}: {
  initial: LocationValues;
  features: { geofence: boolean; ipLock: boolean; photoProof: boolean };
  /** Present when the plan has regions (Enterprise). */
  regions?: { id: string; name: string }[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [ips, setIps] = useState(initial.allowedIps.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setV((x) => ({ ...x, latitude: p.coords.latitude, longitude: p.coords.longitude })),
      () => toast.error("Couldn't get your location."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    const r = await saveLocationAction(v.id ?? null, {
      ...v,
      address: v.address || undefined,
      code: v.code || undefined,
      allowedIps: ips
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(r.message);
    router.refresh();
    onSaved?.();
  }

  const locked = (on: boolean) =>
    on ? null : <Lock className="text-muted-foreground inline size-3.5" aria-label="Upgrade required" />;

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`name-${v.id ?? "new"}`}>
          <Input
            id={`name-${v.id ?? "new"}`}
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
        </Field>
        <Field label="Address" htmlFor={`addr-${v.id ?? "new"}`}>
          <Input
            id={`addr-${v.id ?? "new"}`}
            value={v.address}
            onChange={(e) => setV({ ...v, address: e.target.value })}
          />
        </Field>
        <Field label="Branch code" htmlFor={`code-${v.id ?? "new"}`} hint="Shown on reports, e.g. MNL-01">
          <Input
            id={`code-${v.id ?? "new"}`}
            value={v.code}
            onChange={(e) => setV({ ...v, code: e.target.value })}
          />
        </Field>
        {regions.length > 0 ? (
          <Field label="Region" htmlFor={`region-${v.id ?? "new"}`}>
            <Select
              id={`region-${v.id ?? "new"}`}
              value={v.regionId ?? ""}
              onChange={(e) => setV({ ...v, regionId: e.target.value || null })}
            >
              <option value="">No region</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">
            Click the map or drag the pin to the entrance of the site.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={locate}>
            <LocateFixed /> Use my location
          </Button>
        </div>
        <GeofenceMap
          lat={v.latitude}
          lng={v.longitude}
          radius={v.radiusMeters}
          onChange={(lat, lng) => setV({ ...v, latitude: lat, longitude: lng })}
        />
        {v.latitude != null ? (
          <p className="tabular text-muted-foreground text-xs">
            {v.latitude.toFixed(6)}, {v.longitude!.toFixed(6)}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Geofence radius: ${v.radiusMeters} m`} htmlFor={`radius-${v.id ?? "new"}`}>
          <input
            id={`radius-${v.id ?? "new"}`}
            type="range"
            min={25}
            max={1000}
            step={25}
            value={v.radiusMeters}
            onChange={(e) => setV({ ...v, radiusMeters: Number(e.target.value) })}
            className="accent-primary w-full"
          />
        </Field>
        <fieldset disabled={!features.geofence}>
          <legend className="mb-1.5 text-sm font-medium">Geofence {locked(features.geofence)}</legend>
          <div className="bg-muted flex gap-1 rounded-lg p-1 text-sm">
            {(
              [
                ["OFF", "Off"],
                ["WARN", "Flag outside"],
                ["BLOCK", "Block outside"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setV({ ...v, geofenceMode: m })}
                className={`flex-1 rounded-md px-2 py-1.5 ${v.geofenceMode === m ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="space-y-3 rounded-md border p-3">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Auto clock-out when someone leaves the site {locked(features.geofence)}
            <span className="text-muted-foreground block text-xs">
              Uses the app&apos;s location check and a server safety net.
            </span>
          </span>
          <Switch
            checked={v.autoClockOut}
            disabled={!features.geofence}
            onCheckedChange={(c) => setV({ ...v, autoClockOut: c })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Require a photo when punching {locked(features.photoProof)}
            <span className="text-muted-foreground block text-xs">
              Stops buddy punching. Photos are kept for your retention period.
            </span>
          </span>
          <Switch
            checked={v.requirePhoto}
            disabled={!features.photoProof}
            onCheckedChange={(c) => setV({ ...v, requirePhoto: c })}
          />
        </label>
        <Field
          label="Allowed networks (IP lock)"
          htmlFor={`ips-${v.id ?? "new"}`}
          hint={
            features.ipLock
              ? "One IP or CIDR range per line. Leave empty to allow any network."
              : "Available on Pro"
          }
        >
          <Textarea
            id={`ips-${v.id ?? "new"}`}
            disabled={!features.ipLock}
            value={ips}
            onChange={(e) => setIps(e.target.value)}
            placeholder="203.0.113.7"
          />
        </Field>
      </div>
      <div className="flex justify-between">
        {v.id ? (
          <Button
            type="button"
            variant="ghost"
            className="text-danger"
            onClick={async () => {
              if (!confirm("Archive this location?")) return;
              const r = await archiveLocationAction(v.id!);
              if (r.ok) router.refresh();
              else toast.error(r.error);
            }}
          >
            <Archive /> Archive
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save location"}
        </Button>
      </div>
    </div>
  );
}

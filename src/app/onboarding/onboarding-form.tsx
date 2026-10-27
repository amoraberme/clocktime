"use client";

import { LocateFixed } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { createCompanyAction } from "./actions";

const INDUSTRIES = [
  "Restaurant / Café",
  "Retail",
  "Clinic / Healthcare",
  "Cleaning / Facilities",
  "Security agency",
  "Construction",
  "Manufacturing",
  "Hotel / Hospitality",
  "BPO / Office",
  "Nonprofit",
  "Other",
];

export function OnboardingForm({ userName }: { userName: string }) {
  const [state, action, pending] = useActionState(createCompanyAction, null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const err = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  function locate() {
    if (!navigator.geolocation) return setGeoError("Your browser can't share location.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        setGeoError(null);
      },
      () => {
        setLocating(false);
        setGeoError("Couldn't get your location. You can set it later in Locations.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          Welcome, {userName.split(" ")[0]}! Let&apos;s set up your business.
        </CardTitle>
        <CardDescription>Takes a minute. You can change everything later in Settings.</CardDescription>
      </CardHeader>
      <CardContent>
        {state && !state.ok ? (
          <Alert tone="danger" className="mb-4">
            {state.error}
          </Alert>
        ) : null}
        <form action={action} className="space-y-5">
          <Field label="Business name" htmlFor="name" error={err.name}>
            <Input id="name" name="name" required placeholder="e.g. Kape Kanto Café" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Industry" htmlFor="industry">
              <Select id="industry" name="industry" defaultValue="">
                <option value="">Select…</option>
                {INDUSTRIES.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </Select>
            </Field>
            <Field
              label="Pay schedule"
              htmlFor="payFrequency"
              hint="Most PH businesses pay every 15th and 30th"
            >
              <Select id="payFrequency" name="payFrequency" defaultValue="SEMI_MONTHLY">
                <option value="SEMI_MONTHLY">Semi-monthly (15th & 30th)</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </Select>
            </Field>
          </div>
          <div className="bg-muted/40 rounded-lg border p-4">
            <p className="mb-3 text-sm font-medium">Your first work site</p>
            <div className="space-y-4">
              <Field label="Location name" htmlFor="locationName" error={err.locationName}>
                <Input id="locationName" name="locationName" defaultValue="Main branch" required />
              </Field>
              <Field label="Address" htmlFor="address">
                <Input id="address" name="address" placeholder="Street, barangay, city" />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={locate} disabled={locating}>
                  <LocateFixed /> {locating ? "Locating…" : "I'm at this location now"}
                </Button>
                {coords ? (
                  <span className="tabular text-success text-xs">
                    Saved {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                  </span>
                ) : geoError ? (
                  <span className="text-muted-foreground text-xs">{geoError}</span>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    Used for the geofence around this site.
                  </span>
                )}
              </div>
              {coords ? (
                <>
                  <input type="hidden" name="latitude" value={coords.lat} />
                  <input type="hidden" name="longitude" value={coords.lng} />
                </>
              ) : null}
            </div>
          </div>
          <Button className="w-full" size="lg" disabled={pending}>
            {pending ? "Setting up…" : "Create my company"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

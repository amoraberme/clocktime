"use client";

import { CloudOff, Coffee, LocateFixed, LogIn, LogOut, MapPin, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { formatDistance, haversineMeters } from "@/lib/geo";
import {
  clearRejected,
  enqueue,
  flush,
  pending,
  rejectedPunches,
  type QueuedPunch,
  type RejectedPunch,
} from "@/lib/offline-queue";
import { cn } from "@/lib/utils";
import type { PunchPayload } from "@/lib/validation/punch";
import type { ClockState } from "@/server/services/timeclock";

type Action = PunchPayload["action"];
type Position = { lat: number; lng: number; accuracy: number };

/** Current position; punches always ask for a fresh fix (maximumAge 0) so stale locations aren't stamped. */
export function getPosition(timeoutMs = 10000, maximumAge = 0): Promise<Position | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge },
    );
  });
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function nextStatus(status: ClockState["status"], action: Action): ClockState["status"] {
  return action === "CLOCK_IN" || action === "BREAK_END" ? "in" : action === "BREAK_START" ? "break" : "out";
}

function fmtDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ClockPanel({
  initial,
  timezone,
  scope,
  firstName,
}: {
  initial: ClockState;
  timezone: string;
  scope: string;
  firstName: string;
}) {
  const [server, setServer] = useState(initial);
  const [queue, setQueue] = useState<QueuedPunch[]>([]);
  const [rejected, setRejected] = useState<RejectedPunch[]>([]);
  const [busy, setBusy] = useState<Action | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [position, setPosition] = useState<Position | null>(null);
  const [locationId, setLocationId] = useState<string>("");
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat("en-PH", { timeZone: timezone, hour: "numeric", minute: "2-digit" }),
    [timezone],
  );
  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-PH", {
        timeZone: timezone,
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [timezone],
  );

  const refreshQueue = useCallback(async () => {
    setQueue(await pending(scope));
    setRejected(await rejectedPunches(scope));
  }, [scope]);

  const sync = useCallback(async () => {
    const res = await flush<ClockState>(scope, "/api/punch/sync");
    if (res?.state) setServer(res.state);
    const failed = res?.results?.filter((r) => !r.ok) ?? [];
    if (failed.length)
      toast.error(
        `${failed.length} offline punch${failed.length > 1 ? "es were" : " was"} rejected. See details below.`,
      );
    else if (res?.results?.length) toast.success("Offline punches synced.");
    await refreshQueue();
  }, [scope, refreshQueue]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const goOnline = () => void sync();
    window.addEventListener("online", goOnline);
    void Promise.resolve()
      .then(refreshQueue)
      .then(() => sync());
    // Show distance to the site without prompting, if location was already allowed.
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => (p.state === "granted" ? getPosition(8000, 60_000).then(setPosition) : null))
      .catch(() => {});
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", goOnline);
    };
  }, [refreshQueue, sync]);

  // Status after replaying queued (not yet synced) punches on top of the server state.
  const status = queue.reduce((s, q) => nextStatus(s, q.action), server.status);
  const queuedIn = queue.find((q) => q.action === "CLOCK_IN");
  const clockInAt = server.entry?.clockInAt ?? queuedIn?.at ?? null;
  const breakStart =
    [...queue].reverse().find((q) => q.action === "BREAK_START")?.at ?? server.entry?.breakStartedAt ?? null;

  const nearest = useMemo(() => {
    if (!position) return null;
    const sites = server.locations.filter((l) => l.latitude != null && l.longitude != null);
    if (!sites.length) return null;
    return sites
      .map((l) => ({ ...l, distance: haversineMeters(position, { lat: l.latitude!, lng: l.longitude! }) }))
      .sort((a, b) => a.distance - b.distance)[0]!;
  }, [position, server.locations]);
  const insideNearest = nearest
    ? nearest.distance - Math.min(position?.accuracy ?? 0, 100) <= nearest.radiusMeters
    : null;

  async function doPunch(action: Action) {
    setBusy(action);
    const pos = await getPosition();
    if (pos) setPosition(pos);
    const payload: PunchPayload = {
      action,
      clientId: crypto.randomUUID(),
      at: new Date().toISOString(),
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      accuracy: pos?.accuracy ?? null,
      locationId: locationId || null,
    };
    try {
      const res = await fetch("/api/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        state?: ClockState;
        result?: { warning?: string };
      };
      if (!body.ok) {
        toast.error(body.error ?? "Punch failed");
      } else {
        if (body.state) setServer(body.state);
        toast.success(successMessage(action, firstName), { description: body.result?.warning });
        if ("vibrate" in navigator) navigator.vibrate?.(60);
      }
    } catch {
      // Offline or server unreachable: keep the punch and sync later.
      await enqueue(scope, payload);
      await refreshQueue();
      toast.info("You're offline. Punch saved and will sync automatically.");
    } finally {
      setBusy(null);
    }
  }

  const elapsed = clockInAt ? now - new Date(clockInAt).getTime() : 0;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div
          className={cn(
            "px-5 pt-6 pb-5 text-center text-white",
            status === "out" ? "bg-slate-700" : status === "break" ? "bg-amber-600" : "bg-primary",
          )}
        >
          <p className="text-sm opacity-80">{dateFmt.format(now)}</p>
          <p className="tabular mt-1 text-5xl font-semibold tracking-tight">{timeFmt.format(now)}</p>
          <p className="mt-3 text-sm font-medium" data-testid="clock-status">
            {status === "out"
              ? "You're clocked out"
              : status === "break"
                ? "On break"
                : "You're on the clock"}
          </p>
          {clockInAt && status !== "out" ? (
            <p className="tabular mt-1 text-2xl font-semibold">{fmtDuration(elapsed)}</p>
          ) : null}
          {status === "break" && breakStart ? (
            <p className="mt-1 text-xs opacity-80">Break started {timeFmt.format(new Date(breakStart))}</p>
          ) : null}
        </div>
        <CardContent className="space-y-3 pt-5">
          {status === "out" && server.locations.length > 1 ? (
            <Select aria-label="Location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Nearest location (automatic)</option>
              {server.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          ) : null}

          {status === "out" ? (
            <Button
              size="xl"
              className="bg-success hover:bg-success/90 w-full"
              disabled={!!busy}
              onClick={() => doPunch("CLOCK_IN")}
            >
              <LogIn className="size-6!" /> {busy ? "Getting location…" : "Clock in"}
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {status === "break" ? (
                <Button size="xl" variant="outline" disabled={!!busy} onClick={() => doPunch("BREAK_END")}>
                  <Coffee className="size-5!" /> End break
                </Button>
              ) : (
                <Button size="xl" variant="outline" disabled={!!busy} onClick={() => doPunch("BREAK_START")}>
                  <Coffee className="size-5!" /> Break
                </Button>
              )}
              <Button size="xl" variant="danger" disabled={!!busy} onClick={() => doPunch("CLOCK_OUT")}>
                <LogOut className="size-5!" /> Clock out
              </Button>
            </div>
          )}

          <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {server.entry?.locationName && status !== "out"
                ? server.entry.locationName
                : nearest
                  ? `${nearest.name} · ${insideNearest ? "you're on site" : `${formatDistance(nearest.distance)} away`}`
                  : "Location is recorded when you punch"}
            </span>
            {!position ? (
              <button
                className="text-primary flex items-center gap-1"
                onClick={() => getPosition().then(setPosition)}
              >
                <LocateFixed className="size-3.5" /> Check location
              </button>
            ) : null}
          </div>
          {nearest && insideNearest === false && nearest.geofenceMode === "BLOCK" && status === "out" ? (
            <p className="bg-warning-soft text-warning flex items-center gap-1.5 rounded-md px-3 py-2 text-xs">
              <TriangleAlert className="size-3.5" /> {nearest.name} only allows clock-ins within{" "}
              {nearest.radiusMeters} m.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!online || queue.length > 0 ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-2 text-sm">
              <CloudOff className="text-warning size-4" />
              {queue.length > 0
                ? `${queue.length} punch${queue.length > 1 ? "es" : ""} waiting to sync`
                : "Offline. Punches will be saved on this phone."}
            </div>
            {queue.length > 0 ? (
              <Button size="sm" variant="outline" onClick={() => sync()}>
                <RefreshCw /> Sync
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {rejected.length > 0 ? (
        <Card className="border-danger/30">
          <CardContent className="space-y-2 py-4 text-sm">
            <p className="text-danger font-medium">Some offline punches were rejected</p>
            {rejected.map((r) => (
              <p key={r.clientId} className="text-muted-foreground">
                {r.action.replace("_", " ").toLowerCase()}{" "}
                {r.at ? `at ${timeFmt.format(new Date(r.at))}` : ""}: {r.error}
              </p>
            ))}
            <Button size="sm" variant="ghost" onClick={() => clearRejected(scope).then(refreshQueue)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function successMessage(action: Action, name: string) {
  switch (action) {
    case "CLOCK_IN":
      return `Clocked in. Have a great shift, ${name}!`;
    case "CLOCK_OUT":
      return `Clocked out. Salamat, ${name}!`;
    case "BREAK_START":
      return "Break started. Enjoy!";
    case "BREAK_END":
      return "Welcome back. Break ended.";
  }
}

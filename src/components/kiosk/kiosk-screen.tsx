"use client";

import { CheckCircle2, CloudOff, Coffee, Delete, LogIn, LogOut, Nfc, QrCode, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LogoMark } from "@/components/logo";
import { createWedgeDetector } from "@/lib/card-reader";
import { enqueue, flush, pending } from "@/lib/offline-queue";
import { cn } from "@/lib/utils";
import { Camera, type CameraHandle } from "./camera";

type Action = "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";
type Cred = { pin: string } | { qr: string } | { card: string };
type Person = {
  firstName: string;
  lastName: string;
  color: string;
  status: "in" | "out" | "break" | "unknown";
};

const RESET_MS = 20_000;

type NfcReader = { scan: () => Promise<void>; onreading: ((e: { serialNumber: string }) => void) | null };

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function KioskScreen({
  deviceId,
  companyName,
  locationName,
  timezone,
  enabled,
  requirePhoto,
  rfid = false,
}: {
  deviceId: string;
  companyName: string;
  locationName: string;
  timezone: string;
  enabled: boolean;
  requirePhoto: boolean;
  /** Accept RFID cards from a keyboard-wedge reader or Android Web NFC */
  rfid?: boolean;
}) {
  const scope = `kiosk:${deviceId}`;
  const [now, setNow] = useState(() => Date.now());
  const [pin, setPin] = useState("");
  const [mode, setMode] = useState<"pin" | "scan" | "person" | "done">("pin");
  const [cred, setCred] = useState<Cred | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" | "offline" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(0);
  const camera = useRef<CameraHandle>(null);
  const lastActivity = useRef(0);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  const time = useMemo(
    () => new Intl.DateTimeFormat("en-PH", { timeZone: timezone, hour: "numeric", minute: "2-digit" }),
    [timezone],
  );
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat("en-PH", {
        timeZone: timezone,
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [timezone],
  );

  const reset = useCallback(() => {
    setPin("");
    setCred(null);
    setPerson(null);
    setMode("pin");
  }, []);

  const sync = useCallback(async () => {
    await flush(scope, "/api/kiosk/sync");
    setQueued((await pending(scope)).length);
  }, [scope]);

  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now());
      if (lastActivity.current === -1) lastActivity.current = Date.now();
      else if (lastActivity.current && Date.now() - lastActivity.current > RESET_MS) {
        lastActivity.current = 0;
        reset();
      }
    }, 1000);
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    const periodic = setInterval(() => void sync(), 60_000);
    void Promise.resolve().then(sync);
    return () => {
      clearInterval(tick);
      clearInterval(periodic);
      window.removeEventListener("online", onOnline);
    };
  }, [reset, sync]);

  // RFID: a USB/Bluetooth reader types the card number and Enter; Android Chrome can read NFC cards.
  const identifyRef = useRef<(c: Cred) => void>(() => {});
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const [nfc, setNfc] = useState<"off" | "available" | "on">("off");
  useEffect(() => {
    if (!rfid) return;
    const detect = createWedgeDetector({ onCard: (card) => identifyRef.current({ card }) });
    const onKey = (e: KeyboardEvent) => {
      if (modeRef.current !== "pin" && modeRef.current !== "scan") return;
      if (detect(e.key, e.timeStamp)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    if ("NDEFReader" in window) void Promise.resolve().then(() => setNfc("available"));
    return () => window.removeEventListener("keydown", onKey);
  }, [rfid]);

  async function startNfc() {
    try {
      const Reader = (window as unknown as { NDEFReader: new () => NfcReader }).NDEFReader;
      const reader = new Reader();
      await reader.scan();
      reader.onreading = (e) => {
        if (modeRef.current === "pin" || modeRef.current === "scan")
          identifyRef.current({ card: e.serialNumber });
      };
      setNfc("on");
    } catch {
      setMessage({ text: "Allow NFC for this site to tap cards on this tablet.", tone: "error" });
    }
  }

  // Marks activity; the 1-second tick stamps the time (keeps render pure).
  function touch() {
    lastActivity.current = -1;
  }

  async function identify(c: Cred) {
    setBusy(true);
    setMessage(null);
    touch();
    try {
      const res = await fetch("/api/kiosk/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      const body = await res.json();
      if (body.unpaired) return location.reload();
      if (!body.ok) {
        setMessage({ text: body.error, tone: "error" });
        setPin("");
        setMode("pin");
        return;
      }
      setCred(c);
      setPerson({ ...body.employee, status: body.status });
      setMode("person");
    } catch {
      // Offline: we can't look the person up, but we can still record the punch for later.
      setCred(c);
      setPerson({ firstName: "Offline", lastName: "mode", color: "#64748b", status: "unknown" });
      setMode("person");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    identifyRef.current = (c) => void identify(c);
  });

  async function doPunch(action: Action) {
    if (!cred) return;
    setBusy(true);
    touch();
    const photo = requirePhoto ? (camera.current?.capture() ?? null) : null;
    if (requirePhoto && !photo) {
      setBusy(false);
      return setMessage({ text: "Look at the camera for your photo, then try again.", tone: "error" });
    }
    const payload = { ...cred, action, clientId: crypto.randomUUID(), at: new Date().toISOString(), photo };
    try {
      const res = await fetch("/api/kiosk/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!body.ok) {
        setMessage({ text: body.error, tone: "error" });
      } else {
        setMessage({ text: doneText(action, body.firstName), tone: "ok" });
        setMode("done");
        setTimeout(reset, 3500);
      }
    } catch {
      // Unverified until it syncs; the server checks the PIN/badge again then.
      await enqueue(scope, payload as never);
      setQueued((await pending(scope)).length);
      setMessage({ text: "Saved offline. It will sync when the internet is back.", tone: "offline" });
      setMode("done");
      setTimeout(reset, 3500);
    } finally {
      setBusy(false);
    }
  }

  function press(d: string) {
    touch();
    setMessage(null);
    if (d === "del") return setPin((p) => p.slice(0, -1));
    if (d === "ok") return pin.length >= 4 && identify({ pin });
    setPin((p) => (p.length < 6 ? p + d : p));
  }

  if (!enabled) {
    return (
      <main className="bg-sidebar flex min-h-dvh items-center justify-center p-6 text-center text-white">
        <p>Kiosk mode isn&apos;t included in {companyName}&apos;s current plan. Ask an admin to upgrade.</p>
      </main>
    );
  }

  return (
    <main className="bg-sidebar flex min-h-dvh flex-col text-white select-none" onPointerDown={touch}>
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <LogoMark className="size-9" />
          <div>
            <p className="font-semibold">{companyName}</p>
            <p className="text-sm text-white/60">{locationName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {!online || queued ? (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-amber-200">
              <CloudOff className="size-4" /> {queued ? `${queued} waiting to sync` : "Offline"}
            </span>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-8 lg:flex-row lg:gap-16">
        <div className="text-center lg:text-left">
          <p className="text-white/70">{date.format(now)}</p>
          <p className="tabular text-6xl font-semibold tracking-tight sm:text-7xl">{time.format(now)}</p>
          {message ? (
            <p
              role="status"
              className={cn(
                "mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-lg",
                message.tone === "ok"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : message.tone === "offline"
                    ? "bg-amber-500/20 text-amber-100"
                    : "bg-red-500/20 text-red-200",
              )}
            >
              {message.tone === "ok" ? <CheckCircle2 className="size-5" /> : null}
              {message.text}
            </p>
          ) : (
            <p className="mt-4 text-lg text-white/70">
              {mode === "pin"
                ? rfid
                  ? "Tap your card, enter your PIN or scan your badge"
                  : "Enter your PIN or scan your badge"
                : ""}
            </p>
          )}
        </div>

        <div className="w-full max-w-sm">
          {mode === "pin" ? (
            <div className="space-y-4">
              <div
                className="flex h-14 items-center justify-center gap-3 rounded-xl bg-white/10"
                aria-label="PIN entered"
              >
                {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
                  <span
                    key={i}
                    className={cn("size-4 rounded-full", i < pin.length ? "bg-amber-300" : "bg-white/25")}
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"].map((d) => (
                  <button
                    key={d}
                    onClick={() => press(d)}
                    disabled={busy}
                    aria-label={d === "del" ? "Delete" : d === "ok" ? "Enter" : d}
                    className={cn(
                      "flex h-16 items-center justify-center rounded-xl text-2xl font-semibold active:scale-95",
                      d === "ok" ? "bg-amber-400 text-black" : "bg-white/10 hover:bg-white/15",
                    )}
                  >
                    {d === "del" ? <Delete /> : d === "ok" ? "OK" : d}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setMode("scan")}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 py-3 text-white/80 hover:bg-white/5"
              >
                <QrCode className="size-5" /> Scan my badge
              </button>
              {rfid && nfc === "available" ? (
                <button
                  onClick={startNfc}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 py-3 text-white/80 hover:bg-white/5"
                >
                  <Nfc className="size-5" /> Turn on NFC card tapping
                </button>
              ) : null}
            </div>
          ) : null}

          {mode === "scan" ? (
            <div className="space-y-3">
              <Camera
                facing="user"
                onQr={(qr) => identify({ qr })}
                className="aspect-square overflow-hidden rounded-2xl bg-black"
              />
              <p className="text-center text-white/70">Hold your badge up to the camera</p>
              <button onClick={reset} className="w-full rounded-xl bg-white/10 py-3">
                Use PIN instead
              </button>
            </div>
          ) : null}

          {mode === "person" && person ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-white/10 p-4">
                <span
                  className="inline-flex size-12 items-center justify-center rounded-full text-lg font-semibold"
                  style={{ background: person.color }}
                >
                  {person.firstName[0]}
                  {person.lastName[0]}
                </span>
                <div>
                  <p className="text-xl font-semibold">
                    {person.status === "unknown" ? "Offline" : `Hi, ${person.firstName}!`}
                  </p>
                  <p className="text-white/70">
                    {person.status === "in"
                      ? "You're clocked in"
                      : person.status === "break"
                        ? "You're on break"
                        : person.status === "out"
                          ? "You're clocked out"
                          : "Choose what to record"}
                  </p>
                </div>
              </div>
              {requirePhoto ? (
                <Camera
                  ref={camera}
                  facing="user"
                  className="aspect-video overflow-hidden rounded-xl bg-black"
                />
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                {(person.status === "out" || person.status === "unknown") && (
                  <KioskButton
                    tone="green"
                    icon={<LogIn />}
                    label="Clock in"
                    onClick={() => doPunch("CLOCK_IN")}
                    disabled={busy}
                    wide={person.status === "out"}
                  />
                )}
                {(person.status === "in" || person.status === "unknown") && (
                  <KioskButton
                    tone="amber"
                    icon={<Coffee />}
                    label="Start break"
                    onClick={() => doPunch("BREAK_START")}
                    disabled={busy}
                  />
                )}
                {(person.status === "break" || person.status === "unknown") && (
                  <KioskButton
                    tone="amber"
                    icon={<Coffee />}
                    label="End break"
                    onClick={() => doPunch("BREAK_END")}
                    disabled={busy}
                  />
                )}
                {(person.status === "in" || person.status === "break" || person.status === "unknown") && (
                  <KioskButton
                    tone="red"
                    icon={<LogOut />}
                    label="Clock out"
                    onClick={() => doPunch("CLOCK_OUT")}
                    disabled={busy}
                  />
                )}
              </div>
              <button
                onClick={reset}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3"
              >
                <X className="size-4" /> Not me
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function KioskButton({
  tone,
  icon,
  label,
  onClick,
  disabled,
  wide,
}: {
  tone: "green" | "red" | "amber";
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  wide?: boolean;
}) {
  const colors = {
    green: "bg-emerald-500 hover:bg-emerald-400",
    red: "bg-red-500 hover:bg-red-400",
    amber: "bg-amber-500 text-black hover:bg-amber-400",
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-20 items-center justify-center gap-2 rounded-xl text-xl font-semibold active:scale-95 disabled:opacity-50 [&_svg]:size-6",
        colors,
        wide && "col-span-2",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function doneText(action: Action, name: string) {
  return {
    CLOCK_IN: `Clocked in. Have a great shift, ${name}!`,
    CLOCK_OUT: `Clocked out. Salamat, ${name}!`,
    BREAK_START: `Enjoy your break, ${name}.`,
    BREAK_END: `Welcome back, ${name}.`,
  }[action];
}

"use client";

import { Bell, BellOff, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { savePushSubscriptionAction, setOwnPinAction, updateProfileAction } from "@/app/me/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function PhoneForm({ phone }: { phone: string }) {
  const [value, setValue] = useState(phone);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await updateProfileAction({ phone: value });
        if (r.ok) toast.success(r.message);
        else toast.error(r.error);
      }}
    >
      <Field label="Mobile number" htmlFor="phone" className="flex-1">
        <Input id="phone" type="tel" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Button variant="outline">Save</Button>
    </form>
  );
}

export function PinForm({ hasPin }: { hasPin: boolean }) {
  const [pin, setPin] = useState("");
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await setOwnPinAction(pin);
        if (r.ok) {
          toast.success(r.message);
          setPin("");
        } else toast.error(r.error);
      }}
    >
      <Field
        label={hasPin ? "Change kiosk PIN" : "Set a kiosk PIN"}
        htmlFor="pin"
        hint="4–6 digits for the shared tablet"
        className="flex-1"
      >
        <Input
          id="pin"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="font-mono tracking-[0.4em]"
          autoComplete="off"
        />
      </Field>
      <Button variant="outline" disabled={pin.length < 4}>
        <KeyRound /> Save
      </Button>
    </form>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushToggle({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "denied">("off");
  useEffect(() => {
    void Promise.resolve().then(async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidKey)
        return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      if (await reg?.pushManager.getSubscription()) setState("on");
    });
  }, [vapidKey]);

  if (state === "unsupported")
    return (
      <p className="text-muted-foreground text-sm">
        Push notifications aren&apos;t available on this device yet. You&apos;ll still see them in the app.
      </p>
    );
  if (state === "denied")
    return (
      <p className="text-muted-foreground text-sm">Notifications are blocked in your browser settings.</p>
    );
  if (state === "on")
    return (
      <p className="text-success flex items-center gap-2 text-sm">
        <Bell className="size-4" /> Notifications are on for this device.
      </p>
    );
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
        const reg =
          (await navigator.serviceWorker.getRegistration()) ??
          (await navigator.serviceWorker.register("/sw.js"));
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        const r = await savePushSubscriptionAction(sub.toJSON());
        if (r.ok) {
          setState("on");
          toast.success(r.message);
        } else toast.error(r.error);
      }}
    >
      <BellOff /> Turn on notifications
    </Button>
  );
}

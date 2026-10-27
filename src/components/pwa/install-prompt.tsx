"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

const DISMISS_KEY = "ct-install-dismissed";

export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone);
    if (dismissed || standalone) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
      void Promise.resolve().then(() => {
        setIos(true);
        setHidden(false);
      });
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  return (
    <div className="bg-card flex items-start gap-3 rounded-lg border p-3 text-sm">
      <Download className="text-primary mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">Add ClockTime to your home screen</p>
        {ios ? (
          <p className="text-muted-foreground mt-0.5">
            Tap <Share className="inline size-3.5" /> Share, then &ldquo;Add to Home Screen&rdquo;. No app
            store needed.
          </p>
        ) : (
          <Button
            size="sm"
            className="mt-2"
            onClick={async () => {
              await event?.prompt();
              dismiss();
            }}
          >
            Install app
          </Button>
        )}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="text-muted-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}

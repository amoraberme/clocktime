"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";

export function PairScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="bg-sidebar flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-white">
      <Logo inverted />
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white/5 p-6 text-center ring-1 ring-white/10">
        <h1 className="text-xl font-semibold">Set up this tablet as a kiosk</h1>
        <p className="text-sm text-white/70">An admin can get a pairing code in Settings → Kiosks.</p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const res = await fetch("/api/kiosk/pair", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            });
            const body = (await res.json()) as { ok: boolean; error?: string };
            setBusy(false);
            if (!body.ok) return setError(body.error ?? "Pairing failed");
            router.refresh();
          }}
        >
          <Input
            aria-label="Pairing code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="h-14 bg-white text-center font-mono text-2xl tracking-[0.4em] text-black uppercase"
            placeholder="ABC123"
            autoFocus
          />
          <Button
            size="lg"
            className="w-full bg-amber-400 text-black hover:bg-amber-300"
            disabled={busy || code.length < 6}
          >
            Pair kiosk
          </Button>
        </form>
      </div>
    </main>
  );
}

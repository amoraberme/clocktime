"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { authClient } from "@/lib/auth-client";

type Setup = { qr: string; secret: string; backupCodes: string[] };

/** Turn two-step verification (authenticator app) on or off for the signed-in user. */
export function TwoFactorCard({ enabled, required }: { enabled: boolean; required: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.twoFactor.enable({ password, issuer: "ClockTime" });
    setBusy(false);
    if (error || !data || !("totpURI" in data)) return setError(error?.message ?? "Couldn't start setup.");
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    setSetup({
      qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 }),
      secret,
      backupCodes: data.backupCodes,
    });
    setPassword("");
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s+/g, "") });
    setBusy(false);
    if (error)
      return setError(error.message ?? "That code didn't work. Check your phone's time and try again.");
    toast.success("Two-step verification is on.");
    setSetup(null);
    setCode("");
    router.refresh();
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (error) return setError(error.message ?? "Couldn't turn it off.");
    toast.success("Two-step verification is off.");
    setPassword("");
    router.refresh();
  }

  return (
    <Card id="two-factor">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" /> Two-step verification
        </CardTitle>
        <CardDescription>
          {enabled
            ? "On. Signing in asks for a code from your authenticator app."
            : "Protect your account with a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {required && !enabled ? (
          <Alert tone="warning" title="Required for your role">
            Your company requires two-step verification for owners, admins and HR. Turn it on to keep using
            the admin pages.
          </Alert>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {setup ? (
          <form onSubmit={confirm} className="space-y-4">
            <div className="flex flex-wrap items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
              <img
                src={setup.qr}
                alt="Scan with your authenticator app"
                className="size-40 rounded border bg-white"
              />
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <p>1. Scan the code with your authenticator app, or enter this key:</p>
                <code
                  className="bg-muted block rounded px-2 py-1 font-mono text-xs break-all"
                  data-testid="totp-secret"
                >
                  {setup.secret}
                </code>
                <p>2. Save these backup codes somewhere safe. Each works once if you lose your phone:</p>
                <code
                  className="bg-muted block rounded px-2 py-1 font-mono text-xs"
                  data-testid="backup-codes"
                >
                  {setup.backupCodes.join("  ")}
                </code>
              </div>
            </div>
            <Field label="3. Enter the 6-digit code to finish" htmlFor="totp-code">
              <Input
                id="totp-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </Field>
            <Button disabled={busy}>Turn on</Button>
          </form>
        ) : (
          <form onSubmit={enabled ? disable : start} className="flex flex-wrap items-end gap-3">
            <Field label="Your password" htmlFor="2fa-password" className="min-w-56 flex-1">
              <Input
                id="2fa-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Button variant={enabled ? "outline" : "default"} disabled={busy}>
              {enabled ? "Turn off" : "Set up"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

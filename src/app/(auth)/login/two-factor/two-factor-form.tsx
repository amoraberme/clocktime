"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-redirect";

export function TwoFactorForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/home");
  const [backup, setBackup] = useState(false);
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s+/g, "");
    setPending(true);
    setError(null);
    const { error } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: trust })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice: trust });
    setPending(false);
    if (error) return setError(error.message ?? "That code didn't work.");
    router.push(next);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Two-step verification</CardTitle>
        <CardDescription>
          {backup
            ? "Enter one of the backup codes you saved when you turned on two-step verification."
            : "Enter the 6-digit code from your authenticator app."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert tone="danger" className="mb-4">
            {error}
          </Alert>
        ) : null}
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={backup ? "Backup code" : "Code"} htmlFor="code">
            <Input
              id="code"
              name="code"
              required
              autoFocus
              autoComplete="one-time-code"
              inputMode={backup ? "text" : "numeric"}
              pattern={backup ? undefined : "[0-9 ]{6,7}"}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={trust} onChange={(e) => setTrust(e.target.checked)} /> Trust this device for 30
            days
          </label>
          <Button type="submit" className="w-full" disabled={pending}>
            Verify
          </Button>
        </form>
        <div className="mt-6 flex justify-between text-sm">
          <button type="button" className="text-primary underline" onClick={() => setBackup(!backup)}>
            {backup ? "Use authenticator code" : "Use a backup code"}
          </button>
          <Link href="/login" className="text-muted-foreground underline">
            Start over
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-redirect";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"), "/home");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [email, setEmail] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) return setError(error.message ?? "Wrong email or password.");
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect)
      return router.push(`/login/two-factor?next=${encodeURIComponent(next)}`);
    router.push(next);
    router.refresh();
  }

  async function sendMagicLink() {
    if (!email) return setError("Enter your email first.");
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: next });
    setPending(false);
    if (error) return setError(error.message ?? "Couldn't send the link.");
    setMagicSent(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to clock in, see your schedule or manage your team.</CardDescription>
      </CardHeader>
      <CardContent>
        {magicSent ? (
          <Alert tone="success" title="Check your email" className="mb-4">
            We sent a sign-in link to {email}.
          </Alert>
        ) : null}
        {error ? (
          <Alert tone="danger" className="mb-4">
            {error}
          </Alert>
        ) : null}
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            Sign in
          </Button>
        </form>
        <div className="text-muted-foreground my-4 flex items-center gap-3 text-xs">
          <span className="bg-border h-px flex-1" /> or <span className="bg-border h-px flex-1" />
        </div>
        <Button variant="outline" className="w-full" onClick={sendMagicLink} disabled={pending}>
          <Mail /> Email me a sign-in link
        </Button>
        <div className="mt-6 flex justify-between text-sm">
          <Link href="/forgot-password" className="text-primary hover:underline">
            Forgot password?
          </Link>
          <Link href="/signup" className="text-primary hover:underline">
            Create an account
          </Link>
        </div>
        <p className="text-muted-foreground mt-4 text-center text-sm">
          Have a company code?{" "}
          <Link href="/join" className="text-primary hover:underline">
            Join your team
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

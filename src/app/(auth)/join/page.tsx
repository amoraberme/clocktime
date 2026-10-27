import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { getSession } from "@/server/context";
import { findCompanyByJoinCode } from "@/server/services/team";
import { JoinButton } from "./join-button";

export const metadata: Metadata = { title: "Join your team" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const company = code ? await findCompanyByJoinCode(code) : null;
  const session = await getSession();
  const next = `/join?code=${encodeURIComponent(code ?? "")}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Join your team</CardTitle>
        <CardDescription>Enter the 8-character company code from your manager.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {code && !company ? (
          <Alert tone="danger">We couldn&apos;t find a company with code {code}.</Alert>
        ) : null}
        {company ? (
          <>
            <Alert tone="info" title={company.name}>
              You&apos;re joining {company.name} on ClockTime.
            </Alert>
            {session ? (
              <JoinButton code={code!} email={session.user.email} />
            ) : (
              <div className="grid gap-2">
                <Button asChild>
                  <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create my account</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/login?next=${encodeURIComponent(next)}`}>I already have an account</Link>
                </Button>
              </div>
            )}
          </>
        ) : (
          <form className="space-y-4" method="get">
            <Field label="Company code" htmlFor="code">
              <Input
                id="code"
                name="code"
                required
                maxLength={9}
                autoCapitalize="characters"
                className="text-center font-mono text-lg tracking-[0.3em] uppercase"
                defaultValue={code}
              />
            </Field>
            <Button className="w-full">Continue</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

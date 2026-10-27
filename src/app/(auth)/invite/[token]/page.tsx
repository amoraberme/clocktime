import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { getSession } from "@/server/context";
import { findInvitation } from "@/server/services/team";
import { AcceptInvite } from "./accept-invite";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findInvitation(token);
  const session = await getSession();

  if (!invite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invite not valid</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert tone="warning">
            This invite link is invalid, was already used, or has expired. Ask your manager to resend it.
          </Alert>
          <Button asChild variant="outline" className="mt-4 w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const next = `/invite/${token}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Join {invite.company.name}</CardTitle>
        <CardDescription>
          Hi {invite.employee.firstName}, you&apos;ve been invited to clock in and get your schedule on
          ClockTime.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {session ? (
          <>
            {session.user.email.toLowerCase() !== invite.email.toLowerCase() ? (
              <Alert tone="warning">
                You&apos;re signed in as {session.user.email}, but this invite was sent to {invite.email}.
              </Alert>
            ) : null}
            <AcceptInvite token={token} />
          </>
        ) : (
          <div className="grid gap-2">
            <Button asChild>
              <Link
                href={`/signup?email=${encodeURIComponent(invite.email)}&next=${encodeURIComponent(next)}`}
              >
                Set up my account
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/login?next=${encodeURIComponent(next)}`}>I already have an account</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

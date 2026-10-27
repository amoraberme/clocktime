"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { acceptInviteAction } from "./actions";

export function AcceptInvite({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button className="w-full" disabled={pending}>
        Accept invite
      </Button>
    </form>
  );
}

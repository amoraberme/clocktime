"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { joinCompanyAction } from "./actions";

export function JoinButton({ code, email }: { code: string; email: string }) {
  const [state, action, pending] = useActionState(joinCompanyAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="code" value={code} />
      {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button className="w-full" disabled={pending}>
        Join as {email}
      </Button>
    </form>
  );
}

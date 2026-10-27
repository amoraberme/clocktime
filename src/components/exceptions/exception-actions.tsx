"use client";

import { Check, CheckCheck, Clock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  decideOvertimeAction,
  resolveExceptionAction,
  resolveManyAction,
} from "@/app/app/exceptions/actions";
import { Button } from "@/components/ui/button";

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    go: async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
      setBusy(true);
      const r = await fn();
      setBusy(false);
      if (r.ok) {
        toast.success(r.message ?? "Done");
        router.refresh();
      } else toast.error(r.error);
    },
  };
}

export function ExceptionActions({ id, type }: { id: string; type: string }) {
  const { busy, go } = useRun();
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {type === "UNAPPROVED_OVERTIME" ? (
        <Button
          size="sm"
          disabled={busy}
          onClick={() => go(() => resolveExceptionAction(id, "approve_overtime"))}
        >
          <Clock /> Approve OT
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => go(() => resolveExceptionAction(id, "resolve"))}
      >
        <Check /> Resolve
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => go(() => resolveExceptionAction(id, "dismiss"))}
      >
        <X /> Dismiss
      </Button>
    </div>
  );
}

export function ResolveAllButton({ ids }: { ids: string[] }) {
  const { busy, go } = useRun();
  return (
    <Button
      variant="outline"
      disabled={busy || ids.length === 0}
      onClick={() =>
        confirm(`Mark ${ids.length} exceptions as resolved?`) && go(() => resolveManyAction(ids))
      }
    >
      <CheckCheck /> Resolve all shown
    </Button>
  );
}

export function OvertimeDecision({ id }: { id: string }) {
  const { busy, go } = useRun();
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" disabled={busy} onClick={() => go(() => decideOvertimeAction(id, true))}>
        <Check /> Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => go(() => decideOvertimeAction(id, false))}
      >
        <X /> Decline
      </Button>
    </div>
  );
}

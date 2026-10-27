"use client";

import { ArrowLeftRight, Check, Hand, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { decideClaimAction, decideSwapAction } from "@/app/app/schedule/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PendingRequest } from "@/server/services/swaps";

export function SwapRequests({ requests, timezone }: { requests: PendingRequest[]; timezone: string }) {
  const router = useRouter();
  const fmt = new Intl.DateTimeFormat("en-PH", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  async function decide(r: PendingRequest, approve: boolean) {
    const res =
      r.kind === "swap" ? await decideSwapAction(r.id, approve) : await decideClaimAction(r.id, approve);
    if (res.ok) {
      toast.success(res.message);
      router.refresh();
    } else toast.error(res.error);
  }
  return (
    <Card className="border-info/30 mb-4">
      <CardHeader>
        <CardTitle className="text-sm">Requests waiting for you ({requests.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
              {r.kind === "swap" ? (
                <ArrowLeftRight className="text-info size-4" />
              ) : (
                <Hand className="text-info size-4" />
              )}
              <span className="flex-1">
                {r.kind === "swap" ? (
                  r.target ? (
                    <>
                      <b>{r.requester}</b> → <b>{r.target}</b> {r.trade ? "(trade)" : "(give away)"}
                    </>
                  ) : (
                    <>
                      <b>{r.requester}</b> wants to drop this shift
                    </>
                  )
                ) : (
                  <>
                    <b>{r.requester}</b> wants to pick up an open shift
                  </>
                )}
                <span className="text-muted-foreground"> · {fmt.format(new Date(r.shiftStart))}</span>
                {r.kind === "swap" && r.note ? (
                  <span className="text-muted-foreground block text-xs">“{r.note}”</span>
                ) : null}
              </span>
              <Button size="sm" onClick={() => decide(r, true)}>
                <Check /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => decide(r, false)}>
                <X /> Decline
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

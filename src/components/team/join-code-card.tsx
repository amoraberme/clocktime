"use client";

import { Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { regenerateJoinCodeAction } from "@/app/app/team/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function JoinCodeCard({
  code,
  appUrl,
  canReset,
}: {
  code: string;
  appUrl: string;
  canReset: boolean;
}) {
  const [current, setCurrent] = useState(code);
  const link = `${appUrl}/join?code=${current}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite with a code</CardTitle>
        <CardDescription>
          Staff can sign up at {appUrl.replace(/^https?:\/\//, "")}/join and enter this code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className="bg-muted/40 rounded-lg border py-3 text-center font-mono text-2xl font-semibold tracking-[0.3em]"
          data-testid="join-code"
        >
          {current}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              toast.success("Link copied");
            }}
          >
            <Copy /> Copy join link
          </Button>
          {canReset ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!confirm("Create a new code? The current one will stop working.")) return;
                const r = await regenerateJoinCodeAction();
                if (r.ok) {
                  setCurrent(r.data);
                  toast.success(r.message);
                } else toast.error(r.error);
              }}
            >
              <RefreshCw /> New code
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelRequestAction } from "@/app/me/requests/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MyRequest } from "@/server/queries/approvals";

const TONE = { PENDING: "warning", APPROVED: "success", DECLINED: "danger", CANCELED: "neutral" } as const;

export function MyRequestList({ requests }: { requests: MyRequest[] }) {
  const router = useRouter();
  if (!requests.length)
    return <p className="text-muted-foreground text-sm">No requests in the last 90 days.</p>;
  return (
    <ul className="divide-y">
      {requests.map((r) => (
        <li
          key={`${r.type}:${r.id}`}
          className="flex flex-wrap items-center gap-2 py-3"
          data-testid="my-request"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">{r.title}</span> · {r.detail}
            </p>
            <p className="text-muted-foreground text-xs">
              Filed {new Date(r.filedAt).toLocaleDateString("en-PH", { dateStyle: "medium" })}
            </p>
          </div>
          <Badge tone={TONE[r.status as keyof typeof TONE] ?? "neutral"}>
            {r.status === "PENDING" && r.levels === 2 && r.level === 2
              ? "endorsed · with HR"
              : r.status.toLowerCase()}
          </Badge>
          {r.cancelable ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const res = await cancelRequestAction(r.type, r.id);
                if (!res.ok) return toast.error(res.error);
                toast.success(res.message);
                router.refresh();
              }}
            >
              Cancel
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

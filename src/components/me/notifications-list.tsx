"use client";

import Link from "next/link";
import { useEffect } from "react";
import { markNotificationsReadAction } from "@/app/me/actions";
import { cn } from "@/lib/utils";

export function NotificationsList({
  items,
  timezone,
}: {
  items: { id: string; title: string; body: string | null; url: string | null; read: boolean; at: string }[];
  timezone: string;
}) {
  useEffect(() => {
    if (items.some((i) => !i.read)) void markNotificationsReadAction();
  }, [items]);
  const fmt = new Intl.DateTimeFormat("en-PH", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (items.length === 0) return <p className="text-muted-foreground text-sm">No notifications yet.</p>;
  return (
    <ul className="divide-y rounded-md border text-sm">
      {items.map((n) => {
        const body = (
          <div className={cn("px-3 py-2", !n.read && "bg-primary-soft/40")}>
            <p className="font-medium">{n.title}</p>
            {n.body ? <p className="text-muted-foreground">{n.body}</p> : null}
            <p className="text-muted-foreground text-xs">{fmt.format(new Date(n.at))}</p>
          </div>
        );
        return <li key={n.id}>{n.url ? <Link href={n.url}>{body}</Link> : body}</li>;
      })}
    </ul>
  );
}

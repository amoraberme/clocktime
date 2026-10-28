"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** `hr: true` pages are open to HR as well as owners and admins. */
const ITEMS = [
  { href: "/app/settings", label: "General" },
  { href: "/app/settings/time", label: "Time rules" },
  { href: "/app/settings/pay", label: "Pay rules" },
  { href: "/app/settings/approvals", label: "Approvals" },
  { href: "/app/settings/regions", label: "Regions" },
  { href: "/app/settings/holidays", label: "Holidays", hr: true },
  { href: "/app/settings/kiosks", label: "Kiosks" },
  { href: "/app/settings/devices", label: "Terminals", hr: true },
  { href: "/app/settings/billing", label: "Plan & billing" },
  { href: "/app/settings/api", label: "API" },
  { href: "/app/settings/webhooks", label: "Webhooks" },
  { href: "/app/settings/audit", label: "Audit log", hr: true },
];

export function SettingsNav({ isAdmin, hidden = [] }: { isAdmin: boolean; hidden?: string[] }) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => (isAdmin || i.hr) && !hidden.includes(i.href));
  return (
    <nav className="-mx-1 mb-8 flex gap-1 overflow-x-auto border-b border-zinc-200/80 px-1">
      {items.map((i) => {
        const active = i.href === "/app/settings" ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            prefetch={true}
            className={cn(
              "-mb-px border-b-2 px-3.5 py-2.5 text-sm whitespace-nowrap transition-colors",
              active
                ? "border-blue-600 font-semibold text-zinc-950"
                : "border-transparent font-medium text-zinc-500 hover:border-zinc-300 hover:text-zinc-800",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

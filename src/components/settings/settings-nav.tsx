"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app/settings", label: "General" },
  { href: "/app/settings/time", label: "Time rules" },
  { href: "/app/settings/pay", label: "Pay rules" },
  { href: "/app/settings/holidays", label: "Holidays" },
  { href: "/app/settings/kiosks", label: "Kiosks" },
  { href: "/app/settings/billing", label: "Plan & billing" },
  { href: "/app/settings/api", label: "API" },
  { href: "/app/settings/audit", label: "Audit log" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b px-1">
      {ITEMS.map((i) => {
        const active = i.href === "/app/settings" ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              active
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

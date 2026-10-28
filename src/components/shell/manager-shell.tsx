"use client";

import { Lock, LogOut, Menu, Repeat, Smartphone, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./icons";
import type { NavItem } from "./nav-config";

export type ShellNavItem = NavItem & { locked: boolean; badge?: number };

export function ManagerShell({
  nav,
  companyName,
  userName,
  userEmail,
  planLabel,
  banner,
  memberships,
  switchCompany,
  children,
}: {
  nav: ShellNavItem[];
  companyName: string;
  userName: string;
  userEmail: string;
  planLabel: string;
  banner?: React.ReactNode;
  memberships: { companyId: string; name: string }[];
  switchCompany: (companyId: string) => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="mb-4 flex items-center justify-between px-2 pt-1">
        <Link href="/app" onClick={() => setOpen(false)}>
          <Logo inverted />
        </Link>
        <button
          className="text-sidebar-foreground rounded p-1 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          <X className="size-5" />
        </button>
      </div>
      {nav.map((item) => {
        const Icon = NAV_ICONS[item.icon]!;
        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href} prefetch={true}
            onClick={() => setOpen(false)}
            className={cn(
              "text-sidebar-foreground/80 hover:bg-sidebar-active/60 flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:text-white",
              active && "bg-sidebar-active text-white",
            )}
          >
            <Icon className="size-4" />
            <span className="flex-1">{item.label}</span>
            {item.locked ? <Lock className="size-3.5 opacity-60" /> : null}
            {item.badge ? (
              <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-semibold text-black">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
      <div className="mt-auto space-y-1 border-t border-white/10 pt-3">
        <Link
          href="/me"
          className="text-sidebar-foreground/80 hover:bg-sidebar-active/60 flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:text-white"
        >
          <Smartphone className="size-4" /> My clock
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="bg-sidebar fixed inset-y-0 left-0 hidden w-60 lg:block">{sidebar}</aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="bg-sidebar absolute inset-y-0 left-0 w-64">{sidebar}</aside>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="bg-card/95 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
          <button className="rounded p-1 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium">
            {companyName}{" "}
            <span className="bg-primary-soft text-primary ml-1 rounded px-1.5 py-0.5 text-xs">
              {planLabel}
            </span>
          </div>
          <Dropdown>
            <DropdownTrigger className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm">
              <span className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold">
                {userName.charAt(0).toUpperCase()}
              </span>
              <span className="hidden max-w-40 truncate sm:inline">{userName}</span>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownLabel>{userEmail}</DropdownLabel>
              {memberships.length > 1 ? (
                <>
                  <DropdownSeparator />
                  <DropdownLabel>Switch company</DropdownLabel>
                  {memberships.map((m) => (
                    <DropdownItem
                      key={m.companyId}
                      onSelect={async () => {
                        await switchCompany(m.companyId);
                        router.refresh();
                      }}
                    >
                      <Repeat /> {m.name}
                    </DropdownItem>
                  ))}
                </>
              ) : null}
              <DropdownSeparator />
              <DropdownItem
                onSelect={async () => {
                  navigator.serviceWorker?.controller?.postMessage("clear-pages");
                  await authClient.signOut();
                  router.push("/login");
                }}
              >
                <LogOut /> Sign out
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

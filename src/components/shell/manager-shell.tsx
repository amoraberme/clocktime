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
    <nav className="flex h-full flex-col gap-1 p-3.5">
      <div className="mb-4 flex items-center justify-between px-2 pt-1">
        <Link href="/app" onClick={() => setOpen(false)}>
          <Logo />
        </Link>
        <button
          className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="space-y-1">
        {nav.map((item) => {
          const Icon = NAV_ICONS[item.icon]!;
          const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              onClick={() => setOpen(false)}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-muted font-semibold text-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {item.locked ? <Lock className="size-3.5 text-muted-foreground/60" /> : null}
              {item.badge ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
      <div className="mt-auto space-y-1 border-t border-border/80 pt-3">
        <Link
          href="/me"
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        >
          <Smartphone className="size-4 text-muted-foreground" /> My clock
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-muted/20">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-border/80 bg-background lg:block">
        {sidebar}
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border/80 bg-background shadow-xl">
            {sidebar}
          </aside>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/80 bg-background/95 px-4 backdrop-blur sm:px-6">
          <button
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {companyName}{" "}
            <span className="ml-1.5 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {planLabel}
            </span>
          </div>
          <Dropdown>
            <DropdownTrigger className="flex cursor-pointer items-center gap-2 rounded-xl p-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-xs">
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
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

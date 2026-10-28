"use client";

import { LayoutDashboard, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark } from "@/components/logo";
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

export function EmployeeShell({
  nav,
  companyName,
  userName,
  isManager,
  children,
}: {
  nav: NavItem[];
  companyName: string;
  userName: string;
  isManager: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <header className="bg-card/95 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
        <LogoMark className="size-7" />
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{companyName}</div>
        <Dropdown>
          <DropdownTrigger className="cursor-pointer rounded-full" aria-label="Account menu">
            <span className="bg-primary text-primary-foreground inline-flex size-8 items-center justify-center rounded-full text-xs font-semibold">
              {userName.charAt(0).toUpperCase()}
            </span>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>{userName}</DropdownLabel>
            <DropdownItem onSelect={() => router.push("/me/profile")}>
              <UserRound /> Profile & PIN
            </DropdownItem>
            {isManager ? (
              <DropdownItem onSelect={() => router.push("/app")}>
                <LayoutDashboard /> Manager dashboard
              </DropdownItem>
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
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">{children}</main>
      <nav className="bg-card fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-2xl">
          {nav.map((item) => {
            const Icon = NAV_ICONS[item.icon]!;
            const active = item.href === "/me" ? pathname === "/me" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href} prefetch={true}
                className={cn(
                  "text-muted-foreground flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
                  active && "text-primary",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

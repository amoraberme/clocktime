"use client";

import { DropdownMenu as M } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dropdown = M.Root;
export const DropdownTrigger = M.Trigger;

export function DropdownContent({ className, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={6}
        align="end"
        className={cn(
          "z-50 min-w-48 rounded-xl border border-zinc-200/80 bg-white p-1.5 text-zinc-900 shadow-lg",
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-700 outline-none select-none transition-colors data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-950 [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return (
    <M.Label className={cn("px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400", className)} {...props} />
  );
}

export function DropdownSeparator() {
  return <M.Separator className="my-1 h-px bg-zinc-100" />;
}

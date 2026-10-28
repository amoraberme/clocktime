"use client";

import { DropdownMenu as M } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuGroup = M.Group;
export const DropdownMenuPortal = M.Portal;
export const DropdownMenuSub = M.Sub;
export const DropdownMenuRadioGroup = M.RadioGroup;

// Backwards-compatible aliases
export const Dropdown = DropdownMenu;
export const DropdownTrigger = DropdownMenuTrigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 min-w-48 overflow-hidden rounded-xl border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-lg duration-100 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}
export const DropdownContent = DropdownMenuContent;

export function DropdownMenuItem({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof M.Item> & { inset?: boolean }) {
  return (
    <M.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground/80 outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
}
export const DropdownItem = DropdownMenuItem;

export function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof M.Label> & { inset?: boolean }) {
  return (
    <M.Label
      data-slot="dropdown-menu-label"
      className={cn(
        "px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
}
export const DropdownLabel = DropdownMenuLabel;

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof M.Separator>) {
  return (
    <M.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border/60", className)}
      {...props}
    />
  );
}
export const DropdownSeparator = DropdownMenuSeparator;

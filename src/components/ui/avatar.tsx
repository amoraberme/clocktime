"use client";

import { Avatar as A } from "radix-ui";
import * as React from "react";
import { cn, initials } from "@/lib/utils";

export function AvatarRoot({ className, ...props }: React.ComponentProps<typeof A.Root>) {
  return (
    <A.Root
      data-slot="avatar"
      className={cn("relative flex size-10 shrink-0 overflow-hidden rounded-full", className)}
      {...props}
    />
  );
}

export function AvatarImage({ className, ...props }: React.ComponentProps<typeof A.Image>) {
  return (
    <A.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

export function AvatarFallback({ className, ...props }: React.ComponentProps<typeof A.Fallback>) {
  return (
    <A.Fallback
      data-slot="avatar-fallback"
      className={cn("flex size-full items-center justify-center rounded-full bg-muted font-semibold", className)}
      {...props}
    />
  );
}

// Backwards-compatible Avatar helper for ClockTime
export function Avatar({
  firstName,
  lastName,
  color,
  size = "md",
  className,
}: {
  firstName: string;
  lastName: string;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const s = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-14 text-base" }[size];
  return (
    <span
      data-slot="avatar"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-2xs select-none",
        s,
        className,
      )}
      style={{ backgroundColor: color ?? "var(--primary)" }}
      aria-hidden
    >
      {initials(firstName, lastName)}
    </span>
  );
}

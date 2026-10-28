"use client";

import { Tabs as T } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn(
        "inline-flex h-10 items-center gap-1 rounded-xl border border-zinc-200/60 bg-zinc-100/80 p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "inline-flex h-8 cursor-pointer items-center rounded-lg px-3.5 text-sm font-medium text-zinc-600 transition-all data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-zinc-950 data-[state=active]:shadow-2xs",
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = T.Content;

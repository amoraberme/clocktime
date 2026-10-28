import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-zinc-100 text-zinc-700 border border-zinc-200/60",
        primary: "bg-blue-50 text-blue-700 border border-blue-200/60",
        success: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
        warning: "bg-amber-50 text-amber-800 border border-amber-200/60",
        danger: "bg-red-50 text-red-700 border border-red-200/60",
        info: "bg-sky-50 text-sky-700 border border-sky-200/60",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function StatusDot({ tone = "neutral" }: { tone?: "success" | "warning" | "danger" | "neutral" }) {
  const color = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
    neutral: "bg-zinc-400",
  }[tone];
  return <span className={cn("inline-block size-2 rounded-full", color)} aria-hidden />;
}

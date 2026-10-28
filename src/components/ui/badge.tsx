import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow-xs hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/80",
        outline: "text-foreground border border-border",
      },
      tone: {
        neutral: "bg-muted text-muted-foreground border border-border/60",
        primary: "bg-primary-soft text-primary border border-primary/20",
        success: "bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
        warning: "bg-amber-50 text-amber-800 border border-amber-200/60 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
        danger: "bg-red-50 text-red-700 border border-red-200/60 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
        info: "bg-blue-50 text-blue-700 border border-blue-200/60 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export function Badge({
  className,
  variant,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, tone }), className)}
      {...props}
    />
  );
}

export function StatusDot({ tone = "neutral" }: { tone?: "success" | "warning" | "danger" | "neutral" }) {
  const color = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
    neutral: "bg-zinc-400",
  }[tone];
  return <span data-slot="status-dot" className={cn("inline-block size-2 rounded-full", color)} aria-hidden />;
}

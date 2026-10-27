import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { cn, initials } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
      <div className="bg-primary-soft text-primary mb-3 rounded-full p-3">
        <Icon className="size-6" />
      </div>
      <p className="font-medium">{title}</p>
      {description ? <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>{label}</span>
        {Icon ? <Icon className="size-4" /> : null}
      </div>
      <div className="tabular mt-2 text-2xl font-semibold">{value}</div>
      {hint ? <div className="text-muted-foreground mt-1 text-xs">{hint}</div> : null}
    </div>
  );
}

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
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        s,
        className,
      )}
      style={{ backgroundColor: color ?? "#0ea5e9" }}
      aria-hidden
    >
      {initials(firstName, lastName)}
    </span>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const styles = {
    info: "bg-info-soft text-info border-info/20",
    warning: "bg-warning-soft text-warning border-warning/20",
    danger: "bg-danger-soft text-danger border-danger/20",
    success: "bg-success-soft text-success border-success/20",
  }[tone];
  return (
    <div
      className={cn("rounded-md border px-4 py-3 text-sm", styles, className)}
      role={tone === "danger" ? "alert" : "status"}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn(title && "mt-1", "text-foreground/80")}>{children}</div> : null}
    </div>
  );
}

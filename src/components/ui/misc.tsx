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
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-zinc-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-blue-50 p-3.5 text-blue-600">
        <Icon className="size-6" />
      </div>
      <p className="font-semibold text-zinc-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p> : null}
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
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs transition-shadow">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-zinc-500">
        <span>{label}</span>
        {Icon ? <Icon className="size-4 text-zinc-400" /> : null}
      </div>
      <div className="tabular mt-3 text-3xl font-bold tracking-tight text-zinc-900">{value}</div>
      {hint ? <div className="mt-2 text-xs text-zinc-500">{hint}</div> : null}
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
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-2xs",
        s,
        className,
      )}
      style={{ backgroundColor: color ?? "#2563eb" }}
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
    info: "bg-blue-50/80 text-blue-900 border-blue-200/60",
    warning: "bg-amber-50/80 text-amber-900 border-amber-200/60",
    danger: "bg-red-50/80 text-red-900 border-red-200/60",
    success: "bg-emerald-50/80 text-emerald-900 border-emerald-200/60",
  }[tone];
  return (
    <div
      className={cn("rounded-xl border px-4 py-3 text-sm", styles, className)}
      role={tone === "danger" ? "alert" : "status"}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title && "mt-1", "text-zinc-700")}>{children}</div> : null}
    </div>
  );
}

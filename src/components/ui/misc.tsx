import type { LucideIcon } from "lucide-react";
import * as React from "react";

export { Alert, AlertTitle, AlertDescription } from "./alert";
export { Avatar } from "./avatar";

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
    <div data-slot="page-header" className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
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
    <div
      data-slot="empty-state"
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"
    >
      <div className="mb-3 rounded-full bg-primary/10 p-3.5 text-primary">
        <Icon className="size-6" />
      </div>
      <p className="font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
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
    <div
      data-slot="stat-card"
      className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-shadow"
    >
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        {Icon ? <Icon className="size-4 text-muted-foreground/70" /> : null}
      </div>
      <div className="tabular mt-3 text-3xl font-bold tracking-tight text-foreground">{value}</div>
      {hint ? <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">{hint}</div> : null}
    </div>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-2xs transition-colors focus:border-blue-500 focus:outline-none focus:ring-3 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-60";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(field, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(field, "min-h-24 py-2.5", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(field, "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-zinc-700", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-zinc-500 leading-normal">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-4 rounded-md border-zinc-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500/30",
        className,
      )}
      {...props}
    />
  );
}

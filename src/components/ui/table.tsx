import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn(
        "border-b border-zinc-200/80 bg-zinc-50/80 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-zinc-100", className)} {...props} />;
}

export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("transition-colors hover:bg-zinc-50/70", className)} {...props} />;
}

export function TH({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={cn("whitespace-nowrap px-5 py-3 font-semibold text-zinc-500", className)} {...props} />;
}

export function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-5 py-3.5 align-middle text-zinc-700", className)} {...props} />;
}

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const alertVariants = cva(
  "relative w-full rounded-xl border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground border-border",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
      },
      tone: {
        info: "bg-blue-50/80 text-blue-900 border-blue-200/60 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900",
        warning: "bg-amber-50/80 text-amber-900 border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
        danger: "bg-red-50/80 text-red-900 border-red-200/60 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900",
        success: "bg-emerald-50/80 text-emerald-900 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Alert({
  className,
  variant,
  tone,
  title,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & {
    title?: string;
  }) {
  return (
    <div
      data-slot="alert"
      role={tone === "danger" || variant === "destructive" ? "alert" : "status"}
      className={cn(alertVariants({ variant, tone: tone ?? (variant === "destructive" ? "danger" : undefined) }), className)}
      {...props}
    >
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      {children ? <AlertDescription className={cn(title && "mt-1")}>{children}</AlertDescription> : null}
    </div>
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return (
    <h5
      data-slot="alert-title"
      className={cn("font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-sm [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
}

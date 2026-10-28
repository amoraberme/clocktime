import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-blue-600 text-white hover:bg-blue-700 shadow-xs active:bg-blue-800",
        secondary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200/80 active:bg-zinc-200",
        outline: "border border-zinc-200/90 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 shadow-2xs",
        ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
        danger: "bg-red-600 text-white hover:bg-red-700 shadow-xs active:bg-red-800",
        link: "text-blue-600 underline-offset-4 hover:underline px-0",
      },
      size: {
        default: "h-9.5 px-4",
        sm: "h-8 px-3 text-xs rounded-lg",
        lg: "h-11 px-5 text-base rounded-xl",
        xl: "h-14 px-7 text-lg rounded-2xl",
        icon: "size-9 rounded-xl",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

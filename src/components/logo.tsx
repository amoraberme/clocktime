import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0f766e" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#ccfbf1" strokeWidth="2.4" />
      <path
        d="M16 10.5V16l3.6 2.4"
        fill="none"
        stroke="#fbbf24"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className={cn("text-lg", inverted ? "text-white" : "text-foreground")}>
        Clock<span className={inverted ? "text-amber-300" : "text-primary"}>Time</span>
      </span>
    </span>
  );
}

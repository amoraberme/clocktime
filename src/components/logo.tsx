import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2563eb" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#dbeafe" strokeWidth="2.2" />
      <path
        d="M16 10.5V16l3.6 2.4"
        fill="none"
        stroke="#ffffff"
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
      <span className={cn("text-lg font-bold tracking-tight", inverted ? "text-white" : "text-zinc-900")}>
        Clock<span className="text-blue-600">Time</span>
      </span>
    </span>
  );
}

import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="from-primary-soft/60 to-background flex min-h-dvh flex-col items-center bg-gradient-to-b px-4 py-10">
      <Link href="/" className="mb-8">
        <Logo />
      </Link>
      <div className="w-full max-w-md">{children}</div>
      <p className="text-muted-foreground mt-8 text-center text-xs">
        By continuing you agree to the{" "}
        <Link className="underline" href="/legal/terms">
          Terms
        </Link>{" "}
        and{" "}
        <Link className="underline" href="/legal/privacy">
          Privacy Notice
        </Link>
        .
      </p>
    </div>
  );
}

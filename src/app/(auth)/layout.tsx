import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50/60 px-4 py-12">
      <Link href="/" className="mb-8 transition-opacity hover:opacity-90">
        <Logo />
      </Link>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 text-center text-xs text-zinc-500">
        By continuing you agree to the{" "}
        <Link className="font-medium text-zinc-700 underline underline-offset-4 hover:text-zinc-950" href="/legal/terms">
          Terms
        </Link>{" "}
        and{" "}
        <Link className="font-medium text-zinc-700 underline underline-offset-4 hover:text-zinc-950" href="/legal/privacy">
          Privacy Notice
        </Link>
        .
      </p>
    </div>
  );
}

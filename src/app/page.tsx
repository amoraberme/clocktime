import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <h1 className="text-4xl font-bold tracking-tight">
        Time clock, scheduling & payroll for Philippine teams
      </h1>
      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link href="/signup">Start free trial</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}

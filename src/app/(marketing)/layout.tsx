import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background min-h-dvh">
      <header className="bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link href="/" aria-label="ClockTime home">
            <Logo />
          </Link>
          <nav className="text-muted-foreground hidden gap-6 text-sm md:flex">
            <Link href="/#features" className="hover:text-foreground">
              Features
            </Link>
            <Link href="/#payroll" className="hover:text-foreground">
              PH payroll
            </Link>
            <Link href="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link href="/#faq" className="hover:text-foreground">
              FAQ
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Start free trial</Link>
            </Button>
          </div>
        </div>
      </header>
      {children}
      <footer className="bg-card border-t">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Logo />
            <p className="text-muted-foreground mt-3 max-w-sm">
              Time clock, scheduling and payroll for small businesses in the Philippines.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium">Product</p>
            <Link className="text-muted-foreground hover:text-foreground block" href="/#features">
              Features
            </Link>
            <Link className="text-muted-foreground hover:text-foreground block" href="/pricing">
              Pricing
            </Link>
            <Link className="text-muted-foreground hover:text-foreground block" href="/join">
              Join your team
            </Link>
          </div>
          <div className="space-y-2">
            <p className="font-medium">Legal</p>
            <Link className="text-muted-foreground hover:text-foreground block" href="/legal/terms">
              Terms of Service
            </Link>
            <Link className="text-muted-foreground hover:text-foreground block" href="/legal/privacy">
              Privacy Notice
            </Link>
          </div>
        </div>
        <p className="text-muted-foreground border-t py-4 text-center text-xs">
          © {new Date().getFullYear()} ClockTime. Made for Filipino teams.
        </p>
      </footer>
    </div>
  );
}

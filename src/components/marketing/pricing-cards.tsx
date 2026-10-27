import { Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ANNUAL_DISCOUNT_PERCENT, PLANS, SALES_EMAIL } from "@/config/plans";
import { cn } from "@/lib/utils";

const peso = (c: number) => `₱${(c / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

export function PricingCards() {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {(["FREE", "STARTER", "PRO", "ENTERPRISE"] as const).map((id) => {
        const p = PLANS[id];
        const featured = id === "PRO";
        return (
          <div
            key={id}
            className={cn(
              "bg-card relative flex flex-col rounded-2xl border p-6 shadow-xs",
              featured && "border-primary ring-primary shadow-lg ring-1",
            )}
          >
            {featured ? (
              <span className="bg-primary text-primary-foreground absolute -top-3 left-6 rounded-full px-3 py-0.5 text-xs font-medium">
                Most popular
              </span>
            ) : null}
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="text-muted-foreground text-sm">{p.tagline}</p>
            {p.quoteOnly ? (
              <>
                <p className="mt-5">
                  <span className="text-4xl font-bold">Custom</span>
                </p>
                <p className="text-muted-foreground mt-1 text-sm">Per-employee pricing, devices and setup</p>
              </>
            ) : (
              <>
                <p className="mt-5">
                  <span className="text-4xl font-bold">{peso(p.monthlyBaseCentavos)}</span>
                  <span className="text-muted-foreground">/month</span>
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {id === "FREE"
                    ? `Up to ${p.includedSeats} people, forever`
                    : `Includes ${p.includedSeats} people, then ${peso(p.extraSeatCentavos)} per person`}
                </p>
              </>
            )}
            <ul className="my-6 flex-1 space-y-2 text-sm">
              {p.highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <Check className="text-primary mt-0.5 size-4 shrink-0" />
                  {h}
                </li>
              ))}
            </ul>
            <Button asChild variant={featured ? "default" : "outline"}>
              {p.quoteOnly ? (
                <a href={`mailto:${SALES_EMAIL}?subject=ClockTime%20Enterprise`}>Talk to us</a>
              ) : (
                <Link href="/signup">{id === "FREE" ? "Start free" : "Start 14-day free trial"}</Link>
              )}
            </Button>
          </div>
        );
      })}
      <p className="text-muted-foreground text-center text-sm md:col-span-2 xl:col-span-4">
        Pay yearly and save {ANNUAL_DISCOUNT_PERCENT}%. One price for all your locations. Pay with GCash, Maya
        or card. No credit card needed for the trial.
      </p>
    </div>
  );
}

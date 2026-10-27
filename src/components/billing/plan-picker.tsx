"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { checkoutAction, downgradeAction, simulatePaymentAction } from "@/app/app/settings/billing/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PlanCard = {
  id: "FREE" | "STARTER" | "PRO";
  name: string;
  tagline: string;
  highlights: string[];
  monthly: number;
  annual: number;
  seats: number;
  extraSeat: number;
  includedSeats: number;
};

const peso = (c: number) => `₱${(c / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

export function PlanPicker({
  plans,
  current,
  discount,
}: {
  plans: PlanCard[];
  current: { plan: string; active: boolean };
  discount: number;
}) {
  const [interval, setInterval] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [busy, setBusy] = useState<string | null>(null);

  async function choose(plan: PlanCard) {
    setBusy(plan.id);
    if (plan.id === "FREE") {
      if (!confirm("Switch to the Free plan? Paid features stop working right away.")) return setBusy(null);
      const r = await downgradeAction();
      setBusy(null);
      if (r.ok) {
        toast.success(r.message);
        location.reload();
      } else toast.error(r.error);
      return;
    }
    const r = await checkoutAction(plan.id, interval);
    if (!r.ok) {
      setBusy(null);
      return toast.error(r.error);
    }
    window.location.assign(r.data);
  }

  return (
    <div className="space-y-4">
      <div className="bg-muted inline-flex gap-1 rounded-lg p-1 text-sm">
        {(["MONTHLY", "ANNUAL"] as const).map((i) => (
          <button
            key={i}
            onClick={() => setInterval(i)}
            className={cn(
              "rounded-md px-3 py-1.5",
              interval === i ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            {i === "MONTHLY" ? "Monthly" : `Yearly (save ${discount}%)`}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = current.plan === p.id && current.active;
          const price = interval === "ANNUAL" ? p.annual : p.monthly;
          return (
            <div
              key={p.id}
              className={cn(
                "bg-card flex flex-col rounded-xl border p-5",
                p.id === "PRO" && "border-primary ring-primary ring-1",
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {isCurrent ? (
                  <span className="bg-primary-soft text-primary rounded-full px-2 py-0.5 text-xs">
                    Current
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground text-sm">{p.tagline}</p>
              <p className="mt-4 text-3xl font-semibold">
                {peso(price)}
                <span className="text-muted-foreground text-sm font-normal">
                  {p.id === "FREE" ? "" : interval === "ANNUAL" ? "/year" : "/month"}
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                {p.id === "FREE"
                  ? `Up to ${p.includedSeats} people`
                  : `For your ${p.seats} people (${p.includedSeats} included, then ${peso(p.extraSeat)}/person/month)`}
              </p>
              <ul className="my-4 flex-1 space-y-1.5 text-sm">
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-2">
                    <Check className="text-primary mt-0.5 size-4 shrink-0" /> {h}
                  </li>
                ))}
              </ul>
              <Button
                variant={p.id === "PRO" ? "default" : "outline"}
                disabled={!!busy || (isCurrent && p.id === "FREE")}
                onClick={() => choose(p)}
              >
                {busy === p.id
                  ? "Opening checkout…"
                  : p.id === "FREE"
                    ? "Switch to Free"
                    : isCurrent
                      ? "Renew / extend"
                      : `Choose ${p.name}`}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        Pay with GCash, Maya, GrabPay or card through PayMongo. Prices in PHP, VAT exclusive.
      </p>
    </div>
  );
}

export function SimulatePayment({ invoiceId }: { invoiceId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await simulatePaymentAction(invoiceId);
        setBusy(false);
        if (r.ok) {
          toast.success(r.message);
          location.href = "/app/settings/billing";
        } else toast.error(r.error);
      }}
    >
      Simulate successful payment
    </Button>
  );
}

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { PLANS, type Feature } from "@/config/plans";
import { planFor } from "@/lib/entitlements";
import { Button } from "./ui/button";

export function UpgradeCard({
  feature,
  title,
  description,
}: {
  feature: Feature;
  title: string;
  description: string;
}) {
  const plan = PLANS[planFor(feature)];
  return (
    <div className="bg-card flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center">
      <div className="bg-primary-soft text-primary mb-4 rounded-full p-3">
        <Sparkles className="size-6" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">{description}</p>
      <Button asChild className="mt-6">
        <Link href="/app/settings/billing">Upgrade to {plan.name}</Link>
      </Button>
    </div>
  );
}

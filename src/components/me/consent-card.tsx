"use client";

import { Fingerprint, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { giveConsentAction } from "@/app/me/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Data Privacy Act notice and consent for biometric terminals and/or punch locations. */
export function ConsentCard({ biometric, location }: { biometric: boolean; location: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Card data-testid="consent-card">
      <CardHeader>
        <CardTitle>Your privacy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {biometric ? (
          <p className="flex gap-2">
            <Fingerprint className="text-primary mt-0.5 size-4 shrink-0" />
            <span>
              Your employer uses fingerprint or face terminals. Your template stays on the terminal; ClockTime
              only receives your ID, the time and how you verified. You can ask HR for a PIN, card or phone
              instead.
            </span>
          </p>
        ) : null}
        {location ? (
          <p className="flex gap-2">
            <MapPin className="text-primary mt-0.5 size-4 shrink-0" />
            <span>
              Your location is recorded only when you clock in or out (never in between), to confirm where you
              worked. It&apos;s deleted after your employer&apos;s retention period.
            </span>
          </p>
        ) : null}
        <p className="text-muted-foreground">
          Read the{" "}
          <a href="/legal/privacy" className="underline" target="_blank">
            privacy notice
          </a>{" "}
          for your rights under the Data Privacy Act.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await giveConsentAction({ biometric, location });
            setBusy(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            router.refresh();
          }}
        >
          I understand and agree
        </Button>
      </CardContent>
    </Card>
  );
}

import type { Metadata, Viewport } from "next";
import { KioskScreen } from "@/components/kiosk/kiosk-screen";
import { PairScreen } from "@/components/kiosk/pair-screen";
import { hasFeature } from "@/lib/entitlements";
import { currentKiosk } from "@/server/kiosk";

export const metadata: Metadata = { title: "Kiosk", robots: { index: false } };
export const viewport: Viewport = { themeColor: "#0b3b37" };
export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const k = await currentKiosk();
  if (!k) return <PairScreen />;
  return (
    <KioskScreen
      deviceId={k.device.id}
      companyName={k.company.name}
      locationName={k.location.name}
      timezone={k.company.timezone}
      enabled={k.enabled}
      requirePhoto={k.location.requirePhoto && hasFeature(k.plan, "photoProof")}
      rfid={hasFeature(k.plan, "rfid")}
    />
  );
}

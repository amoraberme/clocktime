import { WifiOff } from "lucide-react";
import { LogoMark } from "@/components/logo";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoMark className="size-12" />
      <WifiOff className="text-muted-foreground size-8" />
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        Open the Clock page once while online and it will keep working without a connection. Punches made
        offline sync automatically when you reconnect.
      </p>
    </main>
  );
}

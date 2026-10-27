import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { ServiceWorkerRegistrar } from "@/components/pwa/sw-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ClockTime — Time clock, scheduling & payroll for PH teams", template: "%s · ClockTime" },
  description:
    "GPS time clock, kiosk, scheduling and Philippine payroll (SSS, PhilHealth, Pag-IBIG, BIR) for small businesses.",
  applicationName: "ClockTime",
  appleWebApp: { capable: true, title: "ClockTime", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {children}
        <Toaster richColors position="top-center" />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

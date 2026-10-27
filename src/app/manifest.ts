import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClockTime",
    short_name: "ClockTime",
    description: "Time clock, scheduling and payroll for Philippine teams",
    start_url: "/me",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f8fa",
    theme_color: "#0f766e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Clock in", url: "/me" },
      { name: "Kiosk", url: "/kiosk" },
    ],
  };
}

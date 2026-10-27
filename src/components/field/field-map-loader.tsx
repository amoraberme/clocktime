"use client";

import dynamic from "next/dynamic";

/** Leaflet needs the browser; load the map on the client only. */
export const FieldMapLoader = dynamic(() => import("./field-map"), {
  ssr: false,
  loading: () => <div className="bg-muted h-[28rem] animate-pulse rounded-md" />,
});

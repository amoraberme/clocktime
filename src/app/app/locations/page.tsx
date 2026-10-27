import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import { AddLocation } from "@/components/locations/add-location";
import { LocationEditor } from "@/components/locations/location-editor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { PLANS } from "@/config/plans";
import { canAddLocation } from "@/lib/entitlements";
import { requireContext } from "@/server/context";

export const metadata: Metadata = { title: "Locations" };

export default async function LocationsPage() {
  const ctx = await requireContext("ADMIN");
  const locations = await ctx.db.location.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { employees: true } } },
  });
  const features = {
    geofence: ctx.can("geofence"),
    ipLock: ctx.can("ipLock"),
    photoProof: ctx.can("photoProof"),
  };
  const canAdd = canAddLocation(ctx.plan, locations.length);
  return (
    <>
      <PageHeader
        title="Locations"
        description="Work sites, their geofences and punch rules."
        actions={canAdd ? <AddLocation features={features} /> : null}
      />
      {!canAdd ? (
        <Alert tone="info" className="mb-4">
          The {PLANS[ctx.plan].name} plan includes {PLANS[ctx.plan].maxLocations} location. Upgrade to Pro for
          unlimited locations, each with its own geofence.
        </Alert>
      ) : null}
      <div className="space-y-6">
        {locations.map((l) => (
          <Card key={l.id}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="text-primary size-4" /> {l.name}
              </CardTitle>
              <div className="flex gap-2">
                <Badge>{l._count.employees} people</Badge>
                <Badge
                  tone={
                    l.geofenceMode === "BLOCK" ? "danger" : l.geofenceMode === "WARN" ? "warning" : "neutral"
                  }
                >
                  geofence {l.geofenceMode.toLowerCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <LocationEditor
                features={features}
                initial={{
                  id: l.id,
                  name: l.name,
                  address: l.address ?? "",
                  latitude: l.latitude,
                  longitude: l.longitude,
                  radiusMeters: l.radiusMeters,
                  geofenceMode: l.geofenceMode,
                  autoClockOut: l.autoClockOut,
                  allowedIps: l.allowedIps,
                  requirePhoto: l.requirePhoto,
                }}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

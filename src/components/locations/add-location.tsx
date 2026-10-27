"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { LocationEditor } from "./location-editor";

export function AddLocation({
  features,
  regions,
}: {
  features: { geofence: boolean; ipLock: boolean; photoProof: boolean };
  regions?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add location
        </Button>
      </DialogTrigger>
      <DialogContent title="New location" className="max-w-2xl">
        <LocationEditor
          features={features}
          regions={regions}
          onSaved={() => setOpen(false)}
          initial={{
            name: "",
            address: "",
            latitude: null,
            longitude: null,
            radiusMeters: 150,
            geofenceMode: "OFF",
            autoClockOut: false,
            allowedIps: [],
            requirePhoto: false,
            code: "",
            regionId: null,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

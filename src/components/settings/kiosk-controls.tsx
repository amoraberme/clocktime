"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createKioskAction, revokeDeviceAction } from "@/app/app/settings/kiosks/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";

export function AddKiosk({
  locations,
  appUrl,
}: {
  locations: { id: string; name: string }[];
  appUrl: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Front counter tablet");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [code, setCode] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setCode(null);
          router.refresh();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add kiosk
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add a kiosk tablet"
        description="Staff punch on it with their PIN or QR badge. No personal phone needed."
      >
        {code ? (
          <div className="space-y-4 text-center">
            <p className="text-sm">
              On the tablet, open{" "}
              <span className="font-mono font-medium">{appUrl.replace(/^https?:\/\//, "")}/kiosk</span> and
              enter:
            </p>
            <p
              className="bg-muted rounded-lg border py-4 font-mono text-4xl font-semibold tracking-[0.3em]"
              data-testid="pairing-code"
            >
              {code}
            </p>
            <p className="text-muted-foreground text-xs">The code expires in 15 minutes.</p>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await createKioskAction({ name, locationId });
              if (r.ok) setCode(r.data);
              else toast.error(r.error);
            }}
          >
            <Field label="Name" htmlFor="k-name">
              <Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field
              label="Location"
              htmlFor="k-loc"
              hint="Punches on this kiosk are recorded at this location."
            >
              <Select id="k-loc" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button className="w-full">Get pairing code</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RevokeDevice({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-danger"
      onClick={async () => {
        if (!confirm("Remove this device?")) return;
        const r = await revokeDeviceAction(id);
        if (r.ok) {
          toast.success(r.message);
          router.refresh();
        } else toast.error(r.error);
      }}
    >
      <Trash2 /> Remove
    </Button>
  );
}

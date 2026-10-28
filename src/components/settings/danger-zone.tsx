"use client";

import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { deleteCompanyAction } from "@/app/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export function DangerZone({ companyName, isOwner }: { companyName: string; isOwner: boolean }) {
  const [name, setName] = useState("");
  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>Your data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground">
            Download everything (team, time, schedules, leave, payroll, audit log) as JSON.
          </p>
          <Button asChild variant="outline">
            <a href="/api/export/company">
              <Download /> Export all data
            </a>
          </Button>
        </div>
        {isOwner ? (
          <div className="space-y-3">
            <Separator />
            <p className="font-semibold text-destructive">Delete company</p>
            <p className="text-muted-foreground">
              Permanently deletes {companyName} and all its data. This can&apos;t be undone. Export first.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="Type the company name to confirm"
                placeholder={companyName}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="max-w-xs"
              />
              <Button
                variant="destructive"
                disabled={name !== companyName}
                onClick={async () => {
                  const r = await deleteCompanyAction(name);
                  if (!r.ok) return toast.error(r.error);
                  location.href = "/onboarding";
                }}
              >
                <Trash2 /> Delete forever
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

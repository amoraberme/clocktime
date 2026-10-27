"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addEmployeeAction } from "@/app/app/team/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmployeeForm } from "./employee-form";

export function AddEmployeeDialog(props: {
  locations: { id: string; name: string }[];
  departments: string[];
  positions: string[];
  canAssignRoles: boolean;
  features?: { hrRoles?: boolean; terminals?: boolean; rfid?: boolean; fieldMode?: boolean };
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Add person
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add a team member"
        description="They'll get an invite to clock in from their phone."
        className="max-w-2xl"
      >
        <EmployeeForm
          {...props}
          mode="add"
          action={addEmployeeAction}
          onDone={(id) => {
            setOpen(false);
            router.push(`/app/team/${id}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { updateEmployeeAction } from "@/app/app/team/actions";
import { EmployeeForm, type EmployeeFormValues } from "./employee-form";

export function EditEmployee(props: {
  values: EmployeeFormValues;
  locations: { id: string; name: string }[];
  departments: string[];
  positions: string[];
  canAssignRoles: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  return (
    <EmployeeForm {...props} mode="edit" action={updateEmployeeAction} onDone={() => router.refresh()} />
  );
}

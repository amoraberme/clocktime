"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import type { ActionResult } from "@/server/action";

export type EmployeeFormValues = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  employeeNo?: string | null;
  role?: string;
  payType?: string;
  rate?: number;
  workDaysPerYear?: number;
  isMinimumWageEarner?: boolean;
  timeExempt?: boolean;
  restDays?: number[];
  hireDate?: string | null;
  departmentName?: string | null;
  positionName?: string | null;
  locationIds?: string[];
  bankName?: string | null;
  masked?: { tin: string; sss: string; philhealth: string; pagibig: string; bankAccount: string };
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function EmployeeForm({
  action,
  values = {},
  locations,
  departments,
  positions,
  canAssignRoles,
  isOwner,
  mode,
  onDone,
}: {
  action: (prev: unknown, fd: FormData) => Promise<ActionResult<{ id: string }>>;
  values?: EmployeeFormValues;
  locations: { id: string; name: string }[];
  departments: string[];
  positions: string[];
  canAssignRoles: boolean;
  isOwner?: boolean;
  mode: "add" | "edit";
  onDone?: (id: string) => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const err = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Saved");
      onDone?.(state.data.id);
    }
  }, [state, onDone]);

  const restDays = values.restDays ?? [0];
  const selectedLocations = values.locationIds ?? (locations.length === 1 ? [locations[0]!.id] : []);

  return (
    <form action={formAction} className="space-y-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" error={err.firstName}>
          <Input id="firstName" name="firstName" defaultValue={values.firstName} required />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={err.lastName}>
          <Input id="lastName" name="lastName" defaultValue={values.lastName} />
        </Field>
        <Field
          label="Email"
          htmlFor="email"
          error={err.email}
          hint="Used for their invite, payslips and sign-in"
        >
          <Input id="email" name="email" type="email" defaultValue={values.email ?? ""} />
        </Field>
        <Field label="Mobile number" htmlFor="phone">
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="09XX XXX XXXX"
            defaultValue={values.phone ?? ""}
          />
        </Field>
        <Field label="Employee no." htmlFor="employeeNo" hint="Leave blank to number automatically">
          <Input id="employeeNo" name="employeeNo" defaultValue={values.employeeNo ?? ""} />
        </Field>
        <Field
          label="Role"
          htmlFor="role"
          hint={canAssignRoles ? "Managers see the dashboard for their locations" : undefined}
        >
          <Select
            id="role"
            name="role"
            defaultValue={values.role ?? "EMPLOYEE"}
            disabled={!canAssignRoles || isOwner}
          >
            {isOwner ? <option value="OWNER">Owner</option> : null}
            <option value="EMPLOYEE">Employee</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </Select>
          {!canAssignRoles || isOwner ? (
            <input type="hidden" name="role" value={isOwner ? "EMPLOYEE" : (values.role ?? "EMPLOYEE")} />
          ) : null}
        </Field>
        <Field label="Position" htmlFor="positionName">
          <Input
            id="positionName"
            name="positionName"
            list="positions"
            defaultValue={values.positionName ?? ""}
            placeholder="e.g. Barista"
          />
          <datalist id="positions">
            {positions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Department" htmlFor="departmentName">
          <Input
            id="departmentName"
            name="departmentName"
            list="departments"
            defaultValue={values.departmentName ?? ""}
          />
          <datalist id="departments">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Field>
        <Field label="Hire date" htmlFor="hireDate" error={err.hireDate}>
          <Input id="hireDate" name="hireDate" type="date" defaultValue={values.hireDate ?? ""} />
        </Field>
      </section>

      {locations.length > 0 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Works at</legend>
          <div className="flex flex-wrap gap-3">
            {locations.map((l) => (
              <label key={l.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox name="locationIds" value={l.id} defaultChecked={selectedLocations.includes(l.id)} />{" "}
                {l.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <section className="bg-muted/30 rounded-lg border p-4">
        <p className="mb-3 text-sm font-medium">Pay</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Paid" htmlFor="payType">
            <Select id="payType" name="payType" defaultValue={values.payType ?? "DAILY"}>
              <option value="DAILY">Daily rate</option>
              <option value="MONTHLY">Monthly salary</option>
              <option value="HOURLY">Hourly rate</option>
            </Select>
          </Field>
          <Field label="Rate (₱)" htmlFor="rate" error={err.rate}>
            <Input
              id="rate"
              name="rate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={values.rate ?? ""}
              placeholder="695.00"
            />
          </Field>
          <Field label="Days/year factor" htmlFor="workDaysPerYear" hint="313 = 6-day week, 261 = 5-day week">
            <Select
              id="workDaysPerYear"
              name="workDaysPerYear"
              defaultValue={String(values.workDaysPerYear ?? 313)}
            >
              <option value="313">313</option>
              <option value="261">261</option>
              <option value="365">365</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <fieldset className="flex flex-wrap items-center gap-2 text-sm">
            <legend className="sr-only">Rest days</legend>
            <span className="font-medium">Rest days:</span>
            {WEEKDAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1">
                <Checkbox name="restDays" value={i} defaultChecked={restDays.includes(i)} /> {d}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="isMinimumWageEarner" defaultChecked={values.isMinimumWageEarner} /> Minimum wage
            earner (tax-exempt)
          </label>
        </div>
      </section>

      <details className="rounded-lg border p-4" open={mode === "edit" ? undefined : false}>
        <summary className="cursor-pointer text-sm font-medium">Government IDs & bank (encrypted)</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(
            [
              ["tin", "TIN"],
              ["sss", "SSS number"],
              ["philhealth", "PhilHealth number"],
              ["pagibig", "Pag-IBIG MID number"],
            ] as const
          ).map(([k, label]) => (
            <Field
              key={k}
              label={label}
              htmlFor={k}
              hint={values.masked?.[k] ? `On file: ${values.masked[k]}. Leave blank to keep.` : undefined}
            >
              <Input id={k} name={k} autoComplete="off" />
            </Field>
          ))}
          <Field label="Bank" htmlFor="bankName">
            <Input
              id="bankName"
              name="bankName"
              defaultValue={values.bankName ?? ""}
              placeholder="e.g. BDO, BPI, GCash"
            />
          </Field>
          <Field
            label="Account number"
            htmlFor="bankAccount"
            hint={values.masked?.bankAccount ? `On file: ${values.masked.bankAccount}` : undefined}
          >
            <Input id="bankAccount" name="bankAccount" autoComplete="off" />
          </Field>
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {mode === "add" ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="sendInvite" defaultChecked /> Email them an invite to set up their account
          </label>
        ) : (
          <span />
        )}
        <Button disabled={pending}>
          {pending ? "Saving…" : mode === "add" ? "Add to team" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/server/action";
import { getContextOrThrow } from "@/server/context";
import { regenerateJoinCode } from "@/server/services/company";
import {
  addEmployee,
  archiveEmployee,
  importEmployees,
  regenerateBadge,
  restoreEmployee,
  sendInvitation,
  setEmployeePin,
  updateEmployee,
} from "@/server/services/team";
import { pinSchema } from "@/lib/validation/employee";
import { actorFrom, writeAudit } from "@/server/audit";
import { resetPersonalDevices } from "@/server/device-lock";

function employeeFromForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : undefined;
  };
  return {
    firstName: get("firstName"),
    lastName: get("lastName") ?? "",
    email: get("email"),
    phone: get("phone"),
    employeeNo: get("employeeNo"),
    role: get("role") ?? "EMPLOYEE",
    payType: get("payType") ?? "DAILY",
    rate: get("rate") || 0,
    workDaysPerYear: get("workDaysPerYear") || 313,
    isMinimumWageEarner: formData.get("isMinimumWageEarner") === "on",
    timeExempt: formData.get("timeExempt") === "on",
    restDays: formData.getAll("restDays").map(Number),
    hireDate: get("hireDate"),
    departmentName: get("departmentName"),
    positionName: get("positionName"),
    locationIds: formData.getAll("locationIds").map(String),
    // Blank sensitive fields mean "unchanged" on edit; the service only writes provided values.
    tin: get("tin") || undefined,
    sss: get("sss") || undefined,
    philhealth: get("philhealth") || undefined,
    pagibig: get("pagibig") || undefined,
    bankName: get("bankName"),
    bankAccount: get("bankAccount") || undefined,
  };
}

export async function addEmployeeAction(_prev: unknown, formData: FormData) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    const emp = await addEmployee(ctx, employeeFromForm(formData), {
      sendInvite: formData.get("sendInvite") === "on",
    });
    revalidatePath("/app/team");
    return { id: emp.id };
  }, "Team member added.");
}

export async function updateEmployeeAction(_prev: unknown, formData: FormData) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    const id = String(formData.get("id"));
    await updateEmployee(ctx, id, employeeFromForm(formData));
    revalidatePath(`/app/team/${id}`);
    revalidatePath("/app/team");
    return { id };
  }, "Changes saved.");
}

export async function archiveEmployeeAction(id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    await archiveEmployee(ctx, id);
    revalidatePath("/app/team");
    revalidatePath(`/app/team/${id}`);
  }, "Archived. Their history is kept.");
}

export async function restoreEmployeeAction(id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    await restoreEmployee(ctx, id);
    revalidatePath("/app/team");
    revalidatePath(`/app/team/${id}`);
  }, "Restored.");
}

export async function resendInviteAction(id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    return sendInvitation(ctx, id);
  }, "Invite sent.");
}

export async function setPinAction(id: string, pin: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    await setEmployeePin(ctx, id, pinSchema.parse(pin));
  }, "PIN updated.");
}

export async function resetBadgeAction(id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    await regenerateBadge(ctx, id);
    revalidatePath(`/app/team/${id}`);
  }, "New badge created. The old one no longer works.");
}

const importSchema = z.object({ rows: z.array(z.record(z.string(), z.string())), dryRun: z.boolean() });

export async function importEmployeesAction(input: { rows: Record<string, string>[]; dryRun: boolean }) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    const { rows, dryRun } = importSchema.parse(input);
    const results = await importEmployees(ctx, rows, dryRun);
    if (!dryRun) revalidatePath("/app/team");
    return results;
  });
}

export async function regenerateJoinCodeAction() {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    const code = await regenerateJoinCode(ctx.company.id);
    await writeAudit(actorFrom(ctx), {
      action: "company.joinCode.reset",
      entityType: "Company",
      entityId: ctx.company.id,
    });
    revalidatePath("/app/team");
    return code;
  }, "New join code created. The old code stops working.");
}

export async function resetDeviceAction(id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("MANAGER");
    if (!(await ctx.db.employee.findUnique({ where: { id } }))) throw new Error("Employee not found");
    await resetPersonalDevices(ctx.company.id, id);
    await writeAudit(actorFrom(ctx), {
      action: "employee.device.reset",
      entityType: "Employee",
      entityId: id,
    });
  }, "Phone reset. Their next punch registers a new device.");
}

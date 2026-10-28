import "server-only";
import { z } from "zod";
import { FeatureError } from "@/lib/entitlements";
import { AuthError } from "./context";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** An error whose message is safe to show to the user. */
export class UserError extends Error {}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Wrap a server action body: converts expected errors into ActionResult failures. */
export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, error: err.issues[0]?.message ?? "Please check the form.", fieldErrors };
    }
    if (err instanceof UserError || err instanceof AuthError || err instanceof FeatureError) {
      return { ok: false, error: err.message };
    }
    // Next.js redirect()/notFound() throw special errors that must propagate.
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      String((err as { digest: unknown }).digest).startsWith("NEXT_")
    ) {
      throw err;
    }
    const duplicate = duplicateMessage(err);
    if (duplicate) return { ok: false, error: duplicate };
    console.error(err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export function formToObject(formData: FormData) {
  const out: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    const existing = out[key];
    if (existing === undefined) out[key] = value;
    else out[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return out;
}

const FIELD_LABELS: Record<string, string> = {
  employeeNo: "employee number",
  deviceUserId: "terminal ID",
  cardLookup: "RFID card",
  pinLookup: "kiosk PIN",
  email: "email",
  code: "code",
  name: "name",
  serialNumber: "serial number",
  userId: "account",
};

/**
 * A unique-constraint error (Prisma P2002) that slipped past a service's own checks, as a message
 * people can act on instead of "Something went wrong".
 */
function duplicateMessage(err: unknown) {
  const e = err as {
    code?: string;
    meta?: {
      target?: unknown;
      driverAdapterError?: { cause?: { constraint?: { fields?: string[]; index?: string } } };
    };
  };
  if (e?.code !== "P2002") return null;
  const constraint = e.meta?.driverAdapterError?.cause?.constraint;
  const target =
    e.meta?.target ??
    constraint?.fields ??
    // "Employee_companyId_employeeNo_key" → ["companyId", "employeeNo"]
    constraint?.index?.split("_").slice(1, -1);
  const fields = (Array.isArray(target) ? target : typeof target === "string" ? [target] : [])
    .map(String)
    .filter((f) => f !== "companyId");
  const label = fields.map((f) => FIELD_LABELS[f] ?? f).join(" and ");
  return label
    ? `That ${label} is already in use. Use a different one.`
    : "That value is already in use. Use a different one.";
}

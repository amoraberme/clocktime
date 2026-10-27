"use server";

import { redirect } from "next/navigation";
import { fail, run, type ActionResult } from "@/server/action";
import { getSession } from "@/server/context";
import { joinWithCode } from "@/server/services/team";

export async function joinCompanyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Sign in first.");
  const code = String(formData.get("code") ?? "");
  const result = await run(() => joinWithCode(code, session.user));
  if (!result.ok) return result;
  redirect("/me");
}

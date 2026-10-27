"use server";

import { redirect } from "next/navigation";
import { fail, run, type ActionResult } from "@/server/action";
import { getSession } from "@/server/context";
import { acceptInvitation } from "@/server/services/team";

export async function acceptInviteAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Sign in first.");
  const result = await run(() => acceptInvitation(String(formData.get("token")), session.user));
  if (!result.ok) return result;
  redirect("/me/profile?welcome=1");
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, run, type ActionResult } from "@/server/action";
import { getSession } from "@/server/context";
import { createCompany } from "@/server/services/company";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your business name").max(100),
  industry: z.string().trim().max(60).optional(),
  payFrequency: z.enum(["WEEKLY", "SEMI_MONTHLY", "MONTHLY"]),
  locationName: z.string().trim().min(1, "Name your first location").max(80),
  address: z.string().trim().max(200).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export async function createCompanyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Your session expired. Sign in again.");
  const raw = Object.fromEntries([...formData.entries()].filter(([k, v]) => !k.startsWith("$") && v !== ""));
  const result = await run(async () => {
    const input = schema.parse(raw);
    return createCompany({
      name: input.name,
      industry: input.industry,
      payFrequency: input.payFrequency,
      owner: { userId: session.user.id, name: session.user.name, email: session.user.email },
      location: {
        name: input.locationName,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
      },
    });
  });
  if (!result.ok) return result;
  redirect("/app?welcome=1");
}

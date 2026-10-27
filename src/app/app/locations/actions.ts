"use server";

import { revalidatePath } from "next/cache";
import { run } from "@/server/action";
import { getContextOrThrow } from "@/server/context";
import { archiveLocation, createLocation, updateLocation } from "@/server/services/locations";

export async function saveLocationAction(id: string | null, data: unknown) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    const loc = id ? await updateLocation(ctx, id, data) : await createLocation(ctx, data);
    revalidatePath("/app/locations");
    return loc.id;
  }, "Location saved.");
}

export async function archiveLocationAction(id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    await archiveLocation(ctx, id);
    revalidatePath("/app/locations");
  }, "Location archived.");
}

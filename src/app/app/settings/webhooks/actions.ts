"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/server/action";
import { getContextOrThrow } from "@/server/context";
import { createWebhook, deleteWebhook, setWebhookActive, testWebhook } from "@/server/services/webhooks";

export async function createWebhookAction(input: { url: string; events: string[] }) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    const parsed = z.object({ url: z.string().max(500), events: z.array(z.string()).max(20) }).parse(input);
    const { secret } = await createWebhook(ctx, parsed);
    revalidatePath("/app/settings/webhooks");
    return secret;
  });
}

export async function deleteWebhookAction(id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    await deleteWebhook(ctx, id);
    revalidatePath("/app/settings/webhooks");
  }, "Webhook deleted.");
}

export async function toggleWebhookAction(id: string, active: boolean) {
  return run(
    async () => {
      const ctx = await getContextOrThrow("ADMIN");
      await setWebhookActive(ctx, id, active);
      revalidatePath("/app/settings/webhooks");
    },
    active ? "Webhook turned on." : "Webhook turned off.",
  );
}

export async function testWebhookAction(id: string) {
  return run(async () => {
    const ctx = await getContextOrThrow("ADMIN");
    await testWebhook(ctx, id);
    revalidatePath("/app/settings/webhooks");
  }, "Test delivered.");
}

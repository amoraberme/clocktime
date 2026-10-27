import { cronHandler } from "@/server/cron";
import { detectScheduled } from "@/server/services/exceptions";
import { checkTerminals } from "@/server/services/terminals";
import { deliverPending } from "@/server/services/webhooks";

export const GET = cronHandler(async () => ({
  exceptions: await detectScheduled(),
  offlineTerminals: await checkTerminals(),
  webhooks: await deliverPending(),
}));

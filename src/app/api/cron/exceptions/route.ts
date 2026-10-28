import { cronHandler } from "@/server/cron";
import { detectScheduled } from "@/server/services/exceptions";
import { checkTerminals } from "@/server/services/terminals";
import { deliverPending } from "@/server/services/webhooks";

// Jobs loop over every company; give them the longest function time.
export const maxDuration = 300;

export const GET = cronHandler(async () => ({
  exceptions: await detectScheduled(),
  offlineTerminals: await checkTerminals(),
  webhooks: await deliverPending(),
}));

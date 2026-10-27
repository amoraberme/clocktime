import { cronHandler } from "@/server/cron";
import { detectScheduled } from "@/server/services/exceptions";
import { checkTerminals } from "@/server/services/terminals";

export const GET = cronHandler(async () => ({
  exceptions: await detectScheduled(),
  offlineTerminals: await checkTerminals(),
}));

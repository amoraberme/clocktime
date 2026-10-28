import { cronHandler } from "@/server/cron";
import { billingSweep } from "@/server/services/billing";

// Jobs loop over every company; give them the longest function time.
export const maxDuration = 300;

export const GET = cronHandler(() => billingSweep());

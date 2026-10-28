import { cronHandler } from "@/server/cron";
import { extendRecurrences } from "@/server/services/jobs";

// Jobs loop over every company; give them the longest function time.
export const maxDuration = 300;

export const GET = cronHandler(() => extendRecurrences());

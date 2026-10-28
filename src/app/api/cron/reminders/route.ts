import { cronHandler } from "@/server/cron";
import { shiftReminders } from "@/server/services/jobs";

// Jobs loop over every company; give them the longest function time.
export const maxDuration = 300;

export const GET = cronHandler(() => shiftReminders());

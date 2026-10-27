import { cronHandler } from "@/server/cron";
import { shiftReminders } from "@/server/services/jobs";

export const GET = cronHandler(() => shiftReminders());

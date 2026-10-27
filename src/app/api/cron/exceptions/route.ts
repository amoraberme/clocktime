import { cronHandler } from "@/server/cron";
import { detectScheduled } from "@/server/services/exceptions";

export const GET = cronHandler(() => detectScheduled());

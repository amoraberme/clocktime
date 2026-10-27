import { cronHandler } from "@/server/cron";
import { autoClockOut } from "@/server/services/jobs";

export const GET = cronHandler(() => autoClockOut());

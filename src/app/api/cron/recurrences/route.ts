import { cronHandler } from "@/server/cron";
import { extendRecurrences } from "@/server/services/jobs";

export const GET = cronHandler(() => extendRecurrences());

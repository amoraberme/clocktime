import { cronHandler } from "@/server/cron";
import { cleanup } from "@/server/services/jobs";

export const GET = cronHandler(() => cleanup());

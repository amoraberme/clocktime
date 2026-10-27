import { cronHandler } from "@/server/cron";
import { billingSweep } from "@/server/services/billing";

export const GET = cronHandler(() => billingSweep());

import "server-only";
import { NextResponse } from "next/server";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function cronHandler(job: () => Promise<unknown>) {
  return async (req: Request) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const started = Date.now();
    const result = await job();
    return NextResponse.json({ ok: true, result, ms: Date.now() - started });
  };
}

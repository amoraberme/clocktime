import { NextResponse } from "next/server";
import { UserError } from "@/server/action";
import { getContextOrThrow } from "@/server/context";
import { savePunchPhoto } from "@/server/kiosk";
import { actorOf, errorResponse } from "@/server/punch-http";
import { clientIp } from "@/server/request";
import { afterPunch } from "@/server/services/punch-hooks";
import { getClockState, punch } from "@/server/services/timeclock";
import { punchBatchSchema } from "@/lib/validation/punch";

/** Replays punches queued offline, oldest first. Each result is final: accepted or rejected. */
export async function POST(req: Request) {
  try {
    const ctx = await getContextOrThrow();
    const { punches } = punchBatchSchema.parse(await req.json());
    const actor = actorOf(ctx);
    const ip = clientIp(req.headers);
    const ordered = [...punches].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
    const results: { clientId: string; ok: boolean; error?: string }[] = [];
    for (const p of ordered) {
      try {
        const { photo, auto, ...rest } = p;
        const r = await punch(actor, {
          ...rest,
          at: p.at ? new Date(p.at) : undefined,
          source: auto ? "AUTO" : "MOBILE",
          ip,
          photoKey: await savePunchPhoto(ctx.company.id, photo),
        });
        await afterPunch(ctx.company.id, ctx.employee.id, r.entryId);
        results.push({ clientId: p.clientId, ok: true });
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        results.push({ clientId: p.clientId, ok: false, error: err.message });
      }
    }
    return NextResponse.json({ ok: true, results, state: await getClockState(actor) });
  } catch (err) {
    return errorResponse(err);
  }
}

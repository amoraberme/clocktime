import { NextResponse } from "next/server";
import { z } from "zod";
import { UserError } from "@/server/action";
import { identify, kioskActor, requireKiosk, savePunchPhoto } from "@/server/kiosk";
import { kioskError } from "@/server/kiosk-http";
import { clientIp } from "@/server/request";
import { afterPunch } from "@/server/services/punch-hooks";
import { punch } from "@/server/services/timeclock";

const item = z.object({
  action: z.enum(["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"]),
  clientId: z.uuid(),
  at: z.iso.datetime({ offset: true }).optional(),
  pin: z.string().optional(),
  qr: z.string().optional(),
  photo: z.string().max(900_000).nullish(),
});

/** Replays kiosk punches captured offline. Each is verified (PIN/badge) on arrival. */
export async function POST(req: Request) {
  try {
    const k = await requireKiosk();
    const { punches } = z.object({ punches: z.array(item).min(1).max(200) }).parse(await req.json());
    const results: { clientId: string; ok: boolean; error?: string }[] = [];
    for (const p of [...punches].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""))) {
      try {
        const emp = await identify(k, p.pin ? { pin: p.pin } : { qr: p.qr ?? "" });
        const r = await punch(kioskActor(k, emp), {
          action: p.action,
          clientId: p.clientId,
          at: p.at ? new Date(p.at) : undefined,
          offline: true,
          source: "KIOSK",
          deviceId: k.device.id,
          kioskLocationId: k.location.id,
          ip: clientIp(req.headers),
          photoKey: await savePunchPhoto(k.company.id, p.photo),
        });
        await afterPunch(k.company.id, emp.id, r.entryId);
        results.push({ clientId: p.clientId, ok: true });
      } catch (err) {
        if (!(err instanceof UserError) && !(err && typeof err === "object" && "issues" in err)) throw err;
        results.push({
          clientId: p.clientId,
          ok: false,
          error: err instanceof Error ? err.message : "Rejected",
        });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return kioskError(err);
  }
}

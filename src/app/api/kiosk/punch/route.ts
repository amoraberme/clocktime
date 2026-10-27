import { NextResponse } from "next/server";
import { z } from "zod";
import { identify, identifySchema, kioskActor, requireKiosk, savePunchPhoto } from "@/server/kiosk";
import { kioskError } from "@/server/kiosk-http";
import { clientIp } from "@/server/request";
import { afterPunch } from "@/server/services/punch-hooks";
import { punch } from "@/server/services/timeclock";

const kioskPunchSchema = z.object({
  action: z.enum(["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"]),
  clientId: z.uuid(),
  at: z.iso.datetime({ offset: true }).optional(),
  photo: z.string().max(900_000).nullish(),
});

export async function POST(req: Request) {
  try {
    const k = await requireKiosk();
    const body = await req.json();
    const p = kioskPunchSchema.parse(body);
    const emp = await identify(k, identifySchema.parse(body));
    const photoKey = await savePunchPhoto(k.company.id, p.photo);
    const result = await punch(kioskActor(k, emp), {
      action: p.action,
      clientId: p.clientId,
      at: p.at ? new Date(p.at) : undefined,
      source: "KIOSK",
      deviceId: k.device.id,
      kioskLocationId: k.location.id,
      ip: clientIp(req.headers),
      photoKey,
    });
    await afterPunch(k.company.id, emp.id, result.entryId);
    return NextResponse.json({ ok: true, firstName: emp.firstName, action: result.action, at: result.at });
  } catch (err) {
    return kioskError(err);
  }
}

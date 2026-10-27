import { NextResponse } from "next/server";
import { getContextOrThrow } from "@/server/context";
import { savePunchPhoto } from "@/server/kiosk";
import { actorOf, errorResponse } from "@/server/punch-http";
import { clientIp } from "@/server/request";
import { getClockState, punch } from "@/server/services/timeclock";
import { punchPayloadSchema } from "@/lib/validation/punch";
import { afterPunch } from "@/server/services/punch-hooks";

export async function GET() {
  try {
    const ctx = await getContextOrThrow();
    return NextResponse.json(await getClockState(actorOf(ctx)));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getContextOrThrow();
    const body = punchPayloadSchema.parse(await req.json());
    const actor = actorOf(ctx);
    const { photo, auto, ...rest } = body;
    const result = await punch(actor, {
      ...rest,
      at: body.at ? new Date(body.at) : undefined,
      source: auto ? "AUTO" : "MOBILE",
      ip: clientIp(req.headers),
      photoKey: await savePunchPhoto(ctx.company.id, photo),
    });
    await afterPunch(ctx.company.id, ctx.employee.id, result.entryId);
    return NextResponse.json({ ok: true, result, state: await getClockState(actor) });
  } catch (err) {
    return errorResponse(err);
  }
}

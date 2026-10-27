import { NextResponse } from "next/server";
import { getContextOrThrow } from "@/server/context";
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
    const result = await punch(actor, {
      ...body,
      at: body.at ? new Date(body.at) : undefined,
      source: "MOBILE",
      ip: clientIp(req.headers),
    });
    await afterPunch(ctx.company.id, ctx.employee.id, result.entryId);
    return NextResponse.json({ ok: true, result, state: await getClockState(actor) });
  } catch (err) {
    return errorResponse(err);
  }
}

import { NextResponse } from "next/server";
import { UserError } from "@/server/action";
import { getContextOrThrow } from "@/server/context";
import { hit } from "@/server/rate-limit";
import { savePunchPhoto } from "@/server/kiosk";
import { checkPersonalDevice } from "@/server/device-lock";
import { raiseUntrustedDevice } from "@/server/services/exceptions";
import { dateKey } from "@/lib/time";
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
    if (!(await hit(`punch:${ctx.employee.id}`, 20, 60)).ok)
      throw new UserError("Too many punches. Wait a minute and try again.");
    const body = punchPayloadSchema.parse(await req.json());
    const actor = actorOf(ctx);
    const device = await checkPersonalDevice(ctx);
    const { photo, auto, at: _clientAt, fixAt, ...rest } = body;
    void _clientAt; // live punches use the server clock
    const result = await punch(actor, {
      ...rest,
      fixAt: fixAt ? new Date(fixAt) : null,
      clientKey: device.clientKey,
      source: auto ? "AUTO" : "MOBILE",
      ip: clientIp(req.headers),
      photoKey: await savePunchPhoto(ctx.company.id, photo),
      deviceId: device.deviceId,
    });
    if (device.flag)
      await raiseUntrustedDevice(
        ctx.company.id,
        ctx.employee.id,
        result.entryId,
        dateKey(result.at, ctx.company.timezone),
      );
    await afterPunch(ctx.company.id, ctx.employee.id, result.entryId);
    return NextResponse.json({ ok: true, result, state: await getClockState(actor) });
  } catch (err) {
    return errorResponse(err);
  }
}

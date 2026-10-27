import { NextResponse } from "next/server";
import { identify, kioskActor, requireKiosk } from "@/server/kiosk";
import { kioskError } from "@/server/kiosk-http";
import { getClockState } from "@/server/services/timeclock";

export async function POST(req: Request) {
  try {
    const k = await requireKiosk();
    const emp = await identify(k, await req.json());
    const state = await getClockState(kioskActor(k, emp));
    return NextResponse.json({
      ok: true,
      employee: { firstName: emp.firstName, lastName: emp.lastName, color: emp.color },
      status: state.status,
      since: state.entry?.clockInAt ?? null,
    });
  } catch (err) {
    return kioskError(err);
  }
}

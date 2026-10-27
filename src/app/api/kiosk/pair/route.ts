import { NextResponse } from "next/server";
import { z } from "zod";
import { UserError } from "@/server/action";
import { KIOSK_COOKIE, pairKiosk } from "@/server/kiosk";
import { clientIp } from "@/server/request";

export async function POST(req: Request) {
  try {
    const { code } = z.object({ code: z.string().min(4).max(12) }).parse(await req.json());
    const token = await pairKiosk(code, clientIp(req.headers));
    const res = NextResponse.json({ ok: true });
    res.cookies.set(KIOSK_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
    return res;
  } catch (err) {
    const msg = err instanceof UserError ? err.message : "Enter the pairing code shown in Settings → Kiosks.";
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(KIOSK_COOKIE);
  return res;
}

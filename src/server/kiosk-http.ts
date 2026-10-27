import "server-only";
import { NextResponse } from "next/server";
import { UserError } from "./action";
import { KioskAuthError } from "./kiosk";

export function kioskError(err: unknown) {
  if (err instanceof KioskAuthError)
    return NextResponse.json({ ok: false, error: err.message, unpaired: true }, { status: 401 });
  if (err instanceof UserError) return NextResponse.json({ ok: false, error: err.message }, { status: 422 });
  if (err && typeof err === "object" && "issues" in err) {
    const issues = (err as { issues: { message: string }[] }).issues;
    return NextResponse.json({ ok: false, error: issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
}

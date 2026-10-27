import "server-only";
import { NextResponse } from "next/server";
import { UserError } from "./action";
import { AuthError, type AppContext } from "./context";
import type { PunchActor } from "./services/timeclock";

export function actorOf(ctx: AppContext): PunchActor {
  return {
    companyId: ctx.company.id,
    timezone: ctx.company.timezone,
    plan: ctx.plan,
    settings: ctx.settings,
    employee: ctx.employee,
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof UserError) return NextResponse.json({ ok: false, error: err.message }, { status: 422 });
  if (err instanceof AuthError) return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
  if (err && typeof err === "object" && "issues" in err) {
    return NextResponse.json({ ok: false, error: "Invalid punch data." }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
}

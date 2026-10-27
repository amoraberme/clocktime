import { z } from "zod";
import { ApiError, apiRoute } from "@/server/api-auth";
import { ingestTerminalRecords, terminalTime } from "@/server/services/terminals";

const LOCAL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;

const body = z.object({
  /** Terminal these records came from (optional; must be registered under Settings → Terminals) */
  serialNumber: z.string().max(40).optional(),
  records: z
    .array(
      z.object({
        /** Terminal user ID or employee number */
        userId: z.string().min(1).max(40),
        /** ISO timestamp with offset, or terminal-local "YYYY-MM-DD HH:MM:SS" in the company time zone */
        at: z.string().refine((v) => LOCAL.test(v) || !Number.isNaN(Date.parse(v)), "Invalid time"),
        action: z.enum(["TOGGLE", "CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"]).default("TOGGLE"),
        method: z.enum(["FINGERPRINT", "CARD", "PIN", "FACE", "PALM", "QR"]).default("FINGERPRINT"),
      }),
    )
    .min(1)
    .max(1000),
});

/**
 * Batch upload of attendance logs from a site bridge, another terminal brand or an access-control
 * system. Idempotent: re-sending the same records creates no duplicates.
 */
export const POST = apiRoute("punch", async (ctx, req) => {
  const b = body.parse(await req.json());
  const device = b.serialNumber
    ? await ctx.db.attendanceDevice.findUnique({ where: { serialNumber: b.serialNumber } })
    : null;
  if (b.serialNumber && !device) throw new ApiError(404, "Terminal not registered for this company");
  const tz = ctx.company.timezone;
  const result = await ingestTerminalRecords(
    ctx.company,
    device,
    b.records.map((r) => ({
      userId: r.userId,
      at: LOCAL.test(r.at) ? terminalTime(r.at.length === 16 ? `${r.at}:00` : r.at, tz) : new Date(r.at),
      action: r.action,
      method: r.method,
    })),
    "API",
  );
  return { ok: true, ...result };
});

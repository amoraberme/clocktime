import "server-only";
import { ipAllowed } from "@/lib/geo";
import { hit } from "./rate-limit";
import { clientIp } from "./request";
import {
  noteUnclaimed,
  terminalBySerial,
  terminalEnabled,
  touchTerminal,
  type Terminal,
} from "./services/terminals";

/** Terminals expect plain-text bodies. */
export function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * Identify the terminal from its serial number. Unknown serials are remembered for the admin to
 * claim but get nothing; disabled terminals, lapsed plans and IPs outside an allowlist are refused.
 */
export async function admsTerminal(req: Request): Promise<{ terminal: Terminal } | { response: Response }> {
  const url = new URL(req.url);
  const serial = (url.searchParams.get("SN") ?? url.searchParams.get("sn") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(serial)) return { response: text("ERROR: missing SN", 400) };
  const ip = clientIp(req.headers);
  if (!(await hit(`adms:${serial}`, 300, 60)).ok) return { response: text("ERROR: too many requests", 429) };
  const terminal = await terminalBySerial(serial);
  if (!terminal) {
    await noteUnclaimed(serial, ip, url.searchParams.get("pushver"));
    return { response: text("ERROR: terminal not registered", 403) };
  }
  if (terminal.status !== "ACTIVE" || !terminalEnabled(terminal.company))
    return { response: text("ERROR: terminal disabled", 403) };
  if (!ipAllowed(ip, terminal.allowedIps)) return { response: text("ERROR: address not allowed", 403) };
  await touchTerminal(terminal, ip, { pushVersion: url.searchParams.get("pushver") });
  return { terminal };
}

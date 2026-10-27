import { admsTerminal, text } from "@/server/adms-http";
import { takeCommands } from "@/server/services/terminals";

/** The terminal polls for queued commands (user sync, reboot). */
export async function GET(req: Request) {
  const r = await admsTerminal(req);
  if ("response" in r) return r.response;
  const cmds = await takeCommands(r.terminal.id);
  if (!cmds.length) return text("OK");
  return text(cmds.map((c) => `C:${c.id}:${c.command}`).join("\n"));
}

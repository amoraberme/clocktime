import { parseCommandResults } from "@/lib/terminal/adms";
import { admsTerminal, text } from "@/server/adms-http";
import { recordCommandResults } from "@/server/services/terminals";

/** Results of commands the terminal ran. */
export async function POST(req: Request) {
  const r = await admsTerminal(req);
  if ("response" in r) return r.response;
  await recordCommandResults(r.terminal.id, parseCommandResults(await req.text()));
  return text("OK");
}

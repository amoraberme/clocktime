import { admsTerminal, text } from "@/server/adms-http";

/** Keep-alive used by newer firmware. */
export async function GET(req: Request) {
  const r = await admsTerminal(req);
  if ("response" in r) return r.response;
  return text("OK");
}

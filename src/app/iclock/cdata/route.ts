import { actionFor, handshakeOptions, methodFor, parseAttlog } from "@/lib/terminal/adms";
import { admsTerminal, text } from "@/server/adms-http";
import { prisma } from "@/server/db";
import { ingestTerminalRecords, terminalTime, tzOffsetHours } from "@/server/services/terminals";

/** ZKTeco ADMS handshake: the terminal asks for its options. */
export async function GET(req: Request) {
  const r = await admsTerminal(req);
  if ("response" in r) return r.response;
  const t = r.terminal;
  return text(
    handshakeOptions(t.serialNumber, {
      attlogStamp: t.attlogStamp,
      operlogStamp: t.operlogStamp,
      tzOffsetHours: tzOffsetHours(t.company.timezone),
    }),
  );
}

/** ZKTeco ADMS upload: attendance records (ATTLOG) or operation/enrolment records (OPERLOG). */
export async function POST(req: Request) {
  const r = await admsTerminal(req);
  if ("response" in r) return r.response;
  const t = r.terminal;
  const url = new URL(req.url);
  const table = (url.searchParams.get("table") ?? "").toUpperCase();
  const stamp = url.searchParams.get("Stamp") ?? url.searchParams.get("stamp");
  const body = await req.text();
  if (table === "ATTLOG") {
    const { records } = parseAttlog(body);
    await ingestTerminalRecords(
      t.company,
      t,
      records.map((rec) => ({
        userId: rec.userId,
        at: terminalTime(rec.local, t.company.timezone),
        action: actionFor(rec.status, t.useStatusKeys),
        method: methodFor(rec.verify),
        raw: `${rec.userId}\t${rec.local}\t${rec.status ?? ""}\t${rec.verify ?? ""}`,
      })),
      "BIOMETRIC",
    );
    if (stamp) await prisma.attendanceDevice.update({ where: { id: t.id }, data: { attlogStamp: stamp } });
    return text(`OK: ${records.length}`);
  }
  if (table === "OPERLOG") {
    const lines = body
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .slice(0, 500);
    if (lines.length)
      await prisma.deviceLog.createMany({
        data: lines.map((raw) => ({
          companyId: t.companyId,
          deviceId: t.id,
          kind: "OPERLOG",
          raw,
          status: "INFO",
        })),
      });
    if (stamp) await prisma.attendanceDevice.update({ where: { id: t.id }, data: { operlogStamp: stamp } });
    return text(`OK: ${lines.length}`);
  }
  // Photos and other tables aren't stored.
  return text("OK");
}

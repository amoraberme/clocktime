/**
 * Pretends to be a ZKTeco terminal speaking the ADMS (PUSH) protocol, to test a ClockTime server
 * without hardware: handshake, upload punches, fetch queued commands and acknowledge them.
 *
 * Usage:
 *   pnpm adms:sim --sn CQZ7232260002 [--url http://localhost:3000] [--user 42] [--times "2026-10-27 07:55:00,2026-10-27 17:03:00"]
 *
 * Add the serial number under Settings → Terminals first; unknown terminals get 403.
 */
const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] ?? ""]);
    return acc;
  }, []),
);
const base = (args.url ?? "http://localhost:3000").replace(/\/$/, "");
const sn = args.sn;
if (!sn) {
  console.error("Pass --sn <serial number>");
  process.exit(1);
}
const user = args.user ?? "1";
const now = new Date();
const local = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
const times = args.times
  ? args.times.split(",")
  : [local(new Date(now.getTime() - 9 * 3600_000)), local(now)];

async function call(method: "GET" | "POST", path: string, body?: string) {
  const res = await fetch(`${base}/iclock/${path}`, {
    method,
    body,
    headers: { "Content-Type": "text/plain" },
  });
  const text = await res.text();
  console.log(`${method} /iclock/${path.split("&")[0]} → ${res.status}\n${text.replace(/^/gm, "  ")}`);
  return { status: res.status, text };
}

async function main() {
  const hs = await call("GET", `cdata?SN=${sn}&options=all&pushver=2.4.1&language=69`);
  if (hs.status !== 200) return;
  const attlog = times.map((t) => `${user}\t${t.trim()}\t0\t1\t0\t0\t0`).join("\n");
  await call("POST", `cdata?SN=${sn}&table=ATTLOG&Stamp=${Math.floor(Date.now() / 1000)}`, attlog);
  const cmds = await call("GET", `getrequest?SN=${sn}`);
  const ids = cmds.text
    .split("\n")
    .map((l) => /^C:(\d+):(.*)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m);
  if (ids.length)
    await call(
      "POST",
      `devicecmd?SN=${sn}`,
      ids.map((m) => `ID=${m[1]}&Return=0&CMD=${m[2]!.split(" ")[0]}`).join("\n"),
    );
  console.log(`Done: ${times.length} punches for user ${user}, ${ids.length} commands acknowledged.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

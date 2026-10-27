/**
 * ZKTeco ADMS ("PUSH") protocol helpers and terminal log-file parsing. Pure, so the formats can
 * be unit tested against real-world samples.
 *
 * Terminals call:
 *   GET  /iclock/cdata?SN=…&options=all     handshake; we reply with options
 *   POST /iclock/cdata?SN=…&table=ATTLOG    tab-separated attendance records
 *   POST /iclock/cdata?SN=…&table=OPERLOG   enrolment and operation records
 *   GET  /iclock/getrequest?SN=…            poll for queued commands
 *   POST /iclock/devicecmd?SN=…             command results
 */

export type TerminalAction = "TOGGLE" | "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";

export type TerminalRecord = {
  userId: string;
  /** Terminal-local wall-clock time "YYYY-MM-DD HH:MM:SS" (no zone) */
  local: string;
  status: number | null;
  verify: number | null;
};

/** Verify codes as most ZKTeco firmware reports them. */
export function methodFor(verify: number | null) {
  switch (verify) {
    case 1:
      return "FINGERPRINT";
    case 2:
    case 4:
      return "CARD";
    case 0:
    case 3:
      return "PIN";
    case 9:
    case 15:
      return "FACE";
    case 25:
      return "PALM";
    default:
      return "FINGERPRINT";
  }
}

/**
 * Status keys (check-in/out buttons). Most sites leave them unused, so by default every tap is a
 * TOGGLE and the schedule decides; terminals set to trust their keys map them to explicit actions.
 */
export function actionFor(status: number | null, useStatusKeys: boolean): TerminalAction {
  if (!useStatusKeys) return "TOGGLE";
  switch (status) {
    case 0:
    case 4:
      return "CLOCK_IN";
    case 1:
    case 5:
      return "CLOCK_OUT";
    case 2:
      return "BREAK_START";
    case 3:
      return "BREAK_END";
    default:
      return "TOGGLE";
  }
}

const LOCAL_TS = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function normalizeLocal(raw: string) {
  const m = LOCAL_TS.exec(raw.trim());
  if (!m) return null;
  return `${m[1]} ${m[2]!.padStart(2, "0")}:${m[3]}:${m[4] ?? "00"}`;
}

/** ATTLOG body: `PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify \t workcode …` per line. */
export function parseAttlog(body: string): { records: TerminalRecord[]; bad: string[] } {
  const records: TerminalRecord[] = [];
  const bad: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\t").map((p) => p.trim());
    const local = normalizeLocal(parts[1] ?? "");
    if (!parts[0] || !local) {
      bad.push(line);
      continue;
    }
    const num = (v: string | undefined) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : null);
    records.push({ userId: parts[0], local, status: num(parts[2]), verify: num(parts[3]) });
  }
  return { records, bad };
}

/** Options returned on the handshake. Stamps tell the terminal which records it already sent. */
export function handshakeOptions(
  serial: string,
  o: { attlogStamp?: string | null; operlogStamp?: string | null; tzOffsetHours: number },
) {
  return [
    `GET OPTION FROM: ${serial}`,
    `ATTLOGStamp=${o.attlogStamp || "None"}`,
    `OPERLOGStamp=${o.operlogStamp || "9999"}`,
    "ATTPHOTOStamp=None",
    "ErrorDelay=30",
    "Delay=10",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=TransData AttLog OpLog EnrollUser ChgUser",
    `TimeZone=${o.tzOffsetHours}`,
    "Realtime=1",
    "Encrypt=None",
  ].join("\n");
}

const clean = (v: string) => v.replace(/[\t\r\n]/g, " ").trim();

/** Add or update a user on the terminal (name and RFID card; fingerprints stay on the device). */
export function userInfoCommand(u: { userId: string; name: string; card?: string | null }) {
  return `DATA UPDATE USERINFO PIN=${clean(u.userId)}\tName=${clean(u.name).slice(0, 24)}\tPri=0\tPasswd=\tCard=${clean(u.card ?? "")}\tGrp=1\tTZ=0000000100000000\tVerify=0`;
}

export function deleteUserCommand(userId: string) {
  return `DATA DELETE USERINFO PIN=${clean(userId)}`;
}

/** devicecmd body: one `ID=…&Return=…&CMD=…` per line. */
export function parseCommandResults(body: string) {
  const out: { id: number; returnCode: number }[] = [];
  for (const line of body.split(/\r?\n/)) {
    const p = new URLSearchParams(line.trim());
    const id = Number(p.get("ID"));
    if (!Number.isInteger(id) || id <= 0) continue;
    out.push({ id, returnCode: Number(p.get("Return") ?? 0) });
  }
  return out;
}

// ───────────── Log files exported from terminals ─────────────

export type ImportedRecord = { userId: string; local: string; action: TerminalAction; line: number };

const HEADER_USER =
  /^(pin|user ?id|userid|ac-?no\.?|enroll(ment)? ?(no|number)|employee ?(no|number|id)|emp ?(no|id)|id|badge)$/i;
const HEADER_DATETIME =
  /^(date ?time|datetime|check ?time|checktime|time ?stamp|timestamp|punch ?time|log ?time)$/i;
const HEADER_DATE = /^date$/i;
const HEADER_TIME = /^time$/i;
const HEADER_STATE = /^(state|status|type|in\/out|check ?type|punch ?type|direction)$/i;

function splitRow(line: string, sep: string) {
  if (sep !== ",") return line.split(sep).map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** "M/D/YYYY h:mm AM", "DD/MM/YYYY HH:MM" (when the day can't be a month) and ISO-ish forms. */
function parseLooseDateTime(raw: string) {
  const iso = normalizeLocal(raw.replace(/\.\d+$/, ""));
  if (iso) return iso;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(raw.trim());
  if (!m) return null;
  let [a, b] = [Number(m[1]), Number(m[2])];
  if (a > 12) [a, b] = [b, a]; // day first
  let h = Number(m[4]);
  if (m[7]) h = (h % 12) + (m[7].toLowerCase() === "pm" ? 12 : 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${m[3]}-${pad(a)}-${pad(b)} ${pad(h)}:${m[5]}:${m[6] ?? "00"}`;
}

function stateAction(raw: string | undefined): TerminalAction {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "TOGGLE";
  if (/^(i|in|check ?in|c\/in|0|time ?in)$/.test(v)) return "CLOCK_IN";
  if (/^(o|out|check ?out|c\/out|1|time ?out)$/.test(v)) return "CLOCK_OUT";
  if (/^(break ?out|2)$/.test(v)) return "BREAK_START";
  if (/^(break ?in|3)$/.test(v)) return "BREAK_END";
  return "TOGGLE";
}

/**
 * Parse an exported log: ZKTeco attlog.dat (tab-separated, no header: PIN, date time, …) or a CSV
 * with headers naming the user ID and the date/time (or separate date and time columns), and
 * optionally the in/out state.
 */
export function parseLogFile(text: string): {
  records: ImportedRecord[];
  errors: { line: number; text: string }[];
} {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const records: ImportedRecord[] = [];
  const errors: { line: number; text: string }[] = [];
  const first = lines.find((l) => l.trim()) ?? "";
  const sep = first.includes("\t") ? "\t" : first.includes(",") ? "," : first.includes(";") ? ";" : "\t";
  const head = splitRow(first, sep);
  const userCol = head.findIndex((h) => HEADER_USER.test(h));
  const dtCol = head.findIndex((h) => HEADER_DATETIME.test(h));
  const dateCol = head.findIndex((h) => HEADER_DATE.test(h));
  const timeCol = head.findIndex((h) => HEADER_TIME.test(h));
  const stateCol = head.findIndex((h) => HEADER_STATE.test(h));
  const hasHeader = userCol >= 0 && (dtCol >= 0 || (dateCol >= 0 && timeCol >= 0));
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    if (!raw.trim() || (hasHeader && raw === first)) return;
    const cells = splitRow(raw, sep);
    let userId: string | undefined;
    let when: string | null = null;
    let action: TerminalAction = "TOGGLE";
    if (hasHeader) {
      userId = cells[userCol];
      when =
        dtCol >= 0
          ? parseLooseDateTime(cells[dtCol] ?? "")
          : parseLooseDateTime(`${cells[dateCol]} ${cells[timeCol]}`);
      action = stateCol >= 0 ? stateAction(cells[stateCol]) : "TOGGLE";
    } else {
      userId = cells[0];
      when = parseLooseDateTime(cells[1] ?? "");
    }
    if (!userId || !when) {
      errors.push({ line: lineNo, text: raw.slice(0, 120) });
      return;
    }
    records.push({ userId: userId.trim(), local: when, action, line: lineNo });
  });
  return { records, errors };
}

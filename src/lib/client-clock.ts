"use client";

/**
 * What the phone knows about its own clock, sent with every punch so offline punches can be
 * checked: how far its clock was from the server's at the last online contact, and a counter
 * that only goes up (a later punch with an earlier time means the clock was turned back).
 */
const OFFSET_KEY = "ct_clock_offset";
const SEQ_KEY = "ct_punch_seq";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: integrity data is best-effort.
  }
}

/** Record the server's clock from a response's Date header. */
export function noteServerTime(res: Response) {
  const date = res.headers.get("date");
  if (!date) return;
  const server = Date.parse(date);
  if (Number.isNaN(server)) return;
  // The Date header has 1-second resolution; that's plenty for minute-level checks.
  write(OFFSET_KEY, String(Math.round(server - Date.now())));
}

export function punchIntegrity() {
  const seq = Number(read(SEQ_KEY) ?? "0") + 1;
  write(SEQ_KEY, String(seq));
  const offset = read(OFFSET_KEY);
  return { seq, clockOffsetMs: offset == null ? null : Number(offset) };
}

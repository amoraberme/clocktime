/**
 * Pairs one person's punches into time entries. Pure, so every edge case can be unit tested.
 *
 * Phone and kiosk punches carry an explicit action (clock in/out, break). Fingerprint and card
 * terminals often only record "this person tapped at this time" (TOGGLE). Those taps are grouped
 * into the shift whose window [start − early, end + late] they fall in: the first tap is the
 * clock-in, the last the clock-out, and pairs in between are breaks. Taps outside any shift
 * alternate in/out. Duties may cross midnight or run past 24 hours; a clock-in left open longer
 * than maxDuty is closed off as a missing clock-out instead of swallowing the next day's punches.
 */

export type PairAction = "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END" | "TOGGLE";

export type PairPunch = { id: string; at: Date; action: PairAction };
export type PairShift = { id: string; startAt: Date; endAt: Date };

export type PairSettings = {
  maxDutyMinutes: number;
  longDutyMinutes: number;
  earlyWindowMinutes: number;
  lateWindowMinutes: number;
};

export type EntryFlag = "MISSING_OUT" | "LONG_DUTY" | "UNSCHEDULED";

export type PairedBreak = {
  startPunchId: string;
  startAt: Date;
  endPunchId: string | null;
  endAt: Date | null;
};

export type PairedEntry = {
  inPunchId: string;
  inAt: Date;
  outPunchId: string | null;
  outAt: Date | null;
  breaks: PairedBreak[];
  shiftId: string | null;
  flags: EntryFlag[];
};

export type Orphan = {
  punchId: string;
  at: Date;
  /** NO_CLOCK_IN: a clock-out with nothing open; STRAY: a break or extra tap with nowhere to go */
  reason: "NO_CLOCK_IN" | "STRAY";
};

export type PairResult = {
  entries: PairedEntry[];
  orphans: Orphan[];
  /** Action each punch was read as (terminal taps resolved to in/out/break). */
  resolved: Map<string, Exclude<PairAction, "TOGGLE">>;
};

const MIN = 60_000;

/** Distance from an instant to a shift's [start, end] (0 when inside). */
function distanceToShift(t: number, s: PairShift) {
  const a = s.startAt.getTime();
  const b = s.endAt.getTime();
  return t < a ? a - t : t > b ? t - b : 0;
}

/** Resolve terminal taps that fall in a shift's window; others are left for the state machine. */
function resolveTaps(punches: PairPunch[], shifts: PairShift[], st: PairSettings) {
  const resolved = new Map<string, Exclude<PairAction, "TOGGLE">>();
  const shiftOf = new Map<string, string>();
  const ignored = new Set<string>();
  const groups = new Map<string, PairPunch[]>();
  for (const p of punches) {
    if (p.action !== "TOGGLE") continue;
    const t = p.at.getTime();
    let best: PairShift | null = null;
    for (const s of shifts) {
      const inWindow =
        t >= s.startAt.getTime() - st.earlyWindowMinutes * MIN &&
        t <= s.endAt.getTime() + st.lateWindowMinutes * MIN;
      if (!inWindow) continue;
      if (!best || distanceToShift(t, s) < distanceToShift(t, best)) best = s;
    }
    if (best) groups.set(best.id, [...(groups.get(best.id) ?? []), p]);
  }
  for (const [shiftId, raw] of groups) {
    const shift = shifts.find((s) => s.id === shiftId)!;
    // Explicit punches in the same window take priority; the state machine handles mixed cases.
    const explicitInWindow = punches.some(
      (p) =>
        p.action !== "TOGGLE" &&
        p.at.getTime() >= shift.startAt.getTime() - st.earlyWindowMinutes * MIN &&
        p.at.getTime() <= shift.endAt.getTime() + st.lateWindowMinutes * MIN,
    );
    if (explicitInWindow) continue;
    const taps = [...raw].sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const tap of taps) shiftOf.set(tap.id, shiftId);
    if (taps.length === 1) {
      const t = taps[0]!.at.getTime();
      const nearerStart = Math.abs(t - shift.startAt.getTime()) <= Math.abs(t - shift.endAt.getTime());
      resolved.set(taps[0]!.id, nearerStart ? "CLOCK_IN" : "CLOCK_OUT");
      continue;
    }
    resolved.set(taps[0]!.id, "CLOCK_IN");
    resolved.set(taps[taps.length - 1]!.id, "CLOCK_OUT");
    const middle = taps.slice(1, -1);
    for (let i = 0; i < middle.length; i++) {
      if (i === middle.length - 1 && middle.length % 2 === 1) ignored.add(middle[i]!.id);
      else resolved.set(middle[i]!.id, i % 2 === 0 ? "BREAK_START" : "BREAK_END");
    }
  }
  return { resolved, shiftOf, ignored };
}

export function pairPunches(
  input: PairPunch[],
  shifts: PairShift[],
  st: PairSettings,
  now: Date = new Date(),
): PairResult {
  const punches = [...input].sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
  const sortedShifts = [...shifts].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const { resolved, shiftOf, ignored } = resolveTaps(punches, sortedShifts, st);
  const entries: PairedEntry[] = [];
  const orphans: Orphan[] = [];
  const entryShift = new Map<PairedEntry, string>();
  let current: PairedEntry | null = null;
  const maxDuty = st.maxDutyMinutes * MIN;

  const close = (e: PairedEntry) => {
    entries.push(e);
    if (current === e) current = null;
  };

  for (const p of punches) {
    if (ignored.has(p.id)) {
      orphans.push({ punchId: p.id, at: p.at, reason: "STRAY" });
      continue;
    }
    const open: PairedEntry | null = current;
    const withinDuty = open !== null && p.at.getTime() - open.inAt.getTime() <= maxDuty;
    let action = resolved.get(p.id);
    if (!action) {
      // Unscheduled terminal tap: close what's open, otherwise start a new duty.
      action = p.action === "TOGGLE" ? (withinDuty ? "CLOCK_OUT" : "CLOCK_IN") : p.action;
      resolved.set(p.id, action);
    }
    if (open && !withinDuty) {
      open.flags.push("MISSING_OUT");
      close(open);
    }
    const cur: PairedEntry | null = current;
    switch (action) {
      case "CLOCK_IN": {
        if (cur) {
          cur.flags.push("MISSING_OUT");
          close(cur);
        }
        const entry: PairedEntry = {
          inPunchId: p.id,
          inAt: p.at,
          outPunchId: null,
          outAt: null,
          breaks: [],
          shiftId: null,
          flags: [],
        };
        const s = shiftOf.get(p.id);
        if (s) entryShift.set(entry, s);
        current = entry;
        break;
      }
      case "CLOCK_OUT": {
        if (!cur) {
          orphans.push({ punchId: p.id, at: p.at, reason: "NO_CLOCK_IN" });
          break;
        }
        cur.outPunchId = p.id;
        cur.outAt = p.at;
        const openBreak = cur.breaks.find((b) => !b.endAt);
        if (openBreak) openBreak.endAt = p.at;
        close(cur);
        break;
      }
      case "BREAK_START": {
        if (!cur || cur.breaks.some((b) => !b.endAt)) {
          orphans.push({ punchId: p.id, at: p.at, reason: "STRAY" });
          break;
        }
        cur.breaks.push({ startPunchId: p.id, startAt: p.at, endPunchId: null, endAt: null });
        break;
      }
      case "BREAK_END": {
        const b = cur?.breaks.find((x) => !x.endAt);
        if (!b) {
          orphans.push({ punchId: p.id, at: p.at, reason: "STRAY" });
          break;
        }
        b.endPunchId = p.id;
        b.endAt = p.at;
        break;
      }
    }
  }
  const last: PairedEntry | null = current;
  if (last) {
    if (now.getTime() - last.inAt.getTime() > maxDuty) last.flags.push("MISSING_OUT");
    entries.push(last);
  }

  // Link each entry to its shift: the one its terminal taps were grouped into, else the shift
  // whose window contains the clock-in (nearest start wins). Split shifts share one shift.
  for (const e of entries) {
    const grouped = entryShift.get(e);
    if (grouped) {
      e.shiftId = grouped;
    } else {
      const t = e.inAt.getTime();
      const candidates = sortedShifts.filter(
        (s) => t >= s.startAt.getTime() - st.earlyWindowMinutes * MIN && t < s.endAt.getTime(),
      );
      candidates.sort((a, b) => Math.abs(a.startAt.getTime() - t) - Math.abs(b.startAt.getTime() - t));
      e.shiftId = candidates[0]?.id ?? null;
    }
    if (!e.shiftId) e.flags.push("UNSCHEDULED");
    // Long = past the review threshold, or for rostered long duties (24h guards) well past the roster.
    const shift = e.shiftId ? sortedShifts.find((s) => s.id === e.shiftId) : null;
    const rostered = shift ? shift.endAt.getTime() - shift.startAt.getTime() + 2 * 60 * MIN : 0;
    const limit = Math.max(st.longDutyMinutes * MIN, rostered);
    if (e.outAt && e.outAt.getTime() - e.inAt.getTime() > limit) e.flags.push("LONG_DUTY");
  }
  entries.sort((a, b) => a.inAt.getTime() - b.inAt.getTime());
  return { entries, orphans, resolved };
}

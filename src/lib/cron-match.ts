/**
 * Minimal 5-field cron matcher (minute hour day-of-month month day-of-week, UTC), enough for the
 * schedules in vercel.json: `*`, `*\/n`, numbers, ranges `a-b` and lists `a,b`.
 */
function fieldMatches(field: string, value: number, min: number) {
  return field.split(",").some((part) => {
    const [range, stepText] = part.split("/") as [string, string | undefined];
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`Bad cron step "${part}"`);
    let lo: number;
    let hi: number;
    if (range === "*") [lo, hi] = [min, Number.MAX_SAFE_INTEGER];
    else if (range.includes("-")) [lo, hi] = range.split("-").map(Number) as [number, number];
    else [lo, hi] = [Number(range), stepText ? Number.MAX_SAFE_INTEGER : Number(range)];
    if (Number.isNaN(lo) || Number.isNaN(hi)) throw new Error(`Bad cron field "${part}"`);
    return value >= lo && value <= hi && (value - lo) % step === 0;
  });
}

export function cronMatches(expr: string, at: Date) {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`Cron "${expr}" needs 5 fields`);
  const [m, h, dom, mon, dow] = f as [string, string, string, string, string];
  const day = at.getUTCDay();
  const domOk = fieldMatches(dom, at.getUTCDate(), 1);
  const dowOk = fieldMatches(dow, day, 0) || (day === 0 && fieldMatches(dow, 7, 0));
  // Standard cron: when both day fields are restricted, either may match.
  const dayOk = dom !== "*" && dow !== "*" ? domOk || dowOk : domOk && dowOk;
  return (
    fieldMatches(m, at.getUTCMinutes(), 0) &&
    fieldMatches(h, at.getUTCHours(), 0) &&
    fieldMatches(mon, at.getUTCMonth() + 1, 1) &&
    dayOk
  );
}

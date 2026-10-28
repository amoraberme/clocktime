/**
 * Stand-in for Vercel Cron outside Vercel (the local production copy, or any server): every
 * minute, calls each /api/cron/* route whose vercel.json schedule matches, with CRON_SECRET.
 *
 *   pnpm cron:local [--url http://localhost:8080] [--once]
 *
 * --once runs every job immediately and exits (handy to check them after seeding).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { cronMatches } from "../src/lib/cron-match";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? "") : undefined;
};
const base = (flag("url") ?? process.env.CRON_TARGET_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET ?? "";
const jobs = (
  JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] }
).crons;

async function call(path: string) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(300_000),
    });
    const body = (await res.text()).slice(0, 300);
    console.log(`${new Date().toISOString()} ${path} → ${res.status} in ${Date.now() - t0}ms ${body}`);
    return res.ok;
  } catch (err) {
    console.log(`${new Date().toISOString()} ${path} → failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

if (!secret) console.warn("CRON_SECRET is empty: the app will reject cron calls in production mode.");
console.log(`Cron runner → ${base}: ${jobs.map((j) => `${j.path} (${j.schedule})`).join(", ")}`);

if (args.includes("--once")) {
  const results = [];
  for (const j of jobs) results.push(await call(j.path));
  process.exit(results.every(Boolean) ? 0 : 1);
}

const running = new Set<string>();
async function tick() {
  const now = new Date();
  for (const j of jobs) {
    if (!cronMatches(j.schedule, now) || running.has(j.path)) continue;
    running.add(j.path); // never overlap a slow run of the same job
    void call(j.path).finally(() => running.delete(j.path));
  }
}
// Align to the start of each minute, like Vercel.
setTimeout(
  () => {
    void tick();
    setInterval(() => void tick(), 60_000);
  },
  60_000 - (Date.now() % 60_000) + 500,
);

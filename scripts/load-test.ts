/**
 * Load test for the shift-start rush: many employees punching at once through the REST API while
 * biometric terminals poll and upload logs. Run it against a preview deployment or `pnpm start`.
 *
 *   pnpm load:test setup --employees 1000 --terminals 100      # creates a throwaway Enterprise company
 *   pnpm load:test run --url http://localhost:3000 [--seconds 60] [--concurrency 40] [--terminals 100] [--backlog]
 *
 * By default terminals push each tap as it happens (Realtime=1). --backlog instead sends each
 * terminal's whole log in one request, like terminals reconnecting after an outage.
 *   pnpm load:test cleanup                                     # deletes the throwaway company
 *
 * Against a seeded company (pnpm seed:scale), a mixed rush with real accounts:
 *   pnpm load:test run --url http://localhost:8080 --company scale-test [--seconds 60]
 *        [--api 400] [--phone 400] [--terminal 500] [--hr 3] [--hr-every 20] [--fresh]
 * API clock-ins, people signing in and punching from their phones, terminal taps, and HR opening
 * the nationwide dashboard, the cutoff report and the Excel export, all at once. Everyone clocks in
 * in the first half and out in the second. --fresh first removes today's punches from earlier runs
 * (the seeded history ends yesterday), so every run starts from the same state.
 * Phone sign-ins all come from one IP: the server needs AUTH_RATE_LIMIT=off (local copy only).
 *
 * `setup` writes the company id, API key and terminal serials to .load-test.json (git-ignored).
 * It talks to the database in DATABASE_URL, so run it with the same env as the server under test.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const STATE = ".load-test.json";
type State = { companyId: string; key: string; employees: string[]; serials: string[]; userIds: string[] };

const [cmd = "run", ...rest] = process.argv.slice(2);
const args = Object.fromEntries(
  rest.reduce<[string, string][]>((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] ?? ""]);
    return acc;
  }, []),
);
const num = (k: string, d: number) => (args[k] ? Number(args[k]) : d);

async function setup() {
  const { prisma } = await import("@/server/db");
  const { createCompany } = await import("@/server/services/company");
  const { createApiKey } = await import("@/server/api-auth");
  const n = num("employees", 1000);
  const t = num("terminals", 100);
  const id = randomUUID().slice(0, 8);
  const userId = randomUUID();
  await prisma.user.create({
    data: { id: userId, name: "Load Test", email: `load-${id}@loadtest.local`, emailVerified: true },
  });
  const { company, owner, location } = await createCompany({
    name: `Load Test ${id}`,
    payFrequency: "SEMI_MONTHLY",
    owner: { userId, name: "Load Test", email: `load-${id}@loadtest.local` },
    location: { name: "Load HQ" },
  });
  await prisma.company.update({
    where: { id: company.id },
    data: { plan: "ENTERPRISE", planStatus: "ACTIVE" },
  });
  const employees = Array.from({ length: n }, (_, i) => `LT${String(i + 1).padStart(5, "0")}`);
  await prisma.employee.createMany({
    data: employees.map((no, i) => ({
      companyId: company.id,
      firstName: "Load",
      lastName: `Tester ${i + 1}`,
      employeeNo: no,
      deviceUserId: String(i + 1),
      payType: "DAILY" as const,
      rateCentavos: 64500,
    })),
  });
  const created = await prisma.employee.findMany({
    where: { companyId: company.id, employeeNo: { in: employees } },
    select: { id: true },
  });
  await prisma.employeeLocation.createMany({
    data: created.map((e) => ({ employeeId: e.id, locationId: location!.id })),
  });
  const serials = Array.from(
    { length: t },
    (_, i) => `LOAD${id.toUpperCase()}${String(i + 1).padStart(4, "0")}`,
  );
  await prisma.attendanceDevice.createMany({
    data: serials.map((serialNumber, i) => ({
      companyId: company.id,
      name: `Load terminal ${i + 1}`,
      serialNumber,
      locationId: location!.id,
    })),
  });
  const { key } = await createApiKey(company.id, "load test", ["punch", "read"], owner.id);
  const state: State = {
    companyId: company.id,
    key,
    employees,
    serials,
    userIds: employees.map((_, i) => String(i + 1)),
  };
  writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(`Created ${company.name}: ${n} employees, ${t} terminals. State in ${STATE}.`);
  await prisma.$disconnect();
}

async function cleanup() {
  if (!existsSync(STATE)) return console.log("Nothing to clean up.");
  const state = JSON.parse(readFileSync(STATE, "utf8")) as State;
  const { prisma } = await import("@/server/db");
  const owner = await prisma.employee.findFirst({ where: { companyId: state.companyId, role: "OWNER" } });
  await prisma.company.delete({ where: { id: state.companyId } });
  if (owner?.userId) await prisma.user.delete({ where: { id: owner.userId } }).catch(() => {});
  unlinkSync(STATE);
  console.log("Deleted the load-test company.");
  await prisma.$disconnect();
}

type Sample = { ms: number; status: number };
const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] ?? 0;

function report(name: string, samples: Sample[], seconds: number) {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const byStatus = samples.reduce<Record<number, number>>(
    (m, s) => ({ ...m, [s.status]: (m[s.status] ?? 0) + 1 }),
    {},
  );
  console.log(
    `${name.padEnd(18)} ${String(samples.length).padStart(6)} req  ${(samples.length / seconds).toFixed(1).padStart(6)}/s  ` +
      `p50 ${pct(ms, 50).toFixed(0)}ms  p95 ${pct(ms, 95).toFixed(0)}ms  p99 ${pct(ms, 99).toFixed(0)}ms  ` +
      `max ${(ms.at(-1) ?? 0).toFixed(0)}ms  status ${JSON.stringify(byStatus)}`,
  );
}

async function timed(fn: () => Promise<Response>): Promise<Sample> {
  const t0 = performance.now();
  try {
    const res = await fn();
    await res.arrayBuffer();
    return { ms: performance.now() - t0, status: res.status };
  } catch {
    return { ms: performance.now() - t0, status: 0 };
  }
}

async function run() {
  if (!existsSync(STATE)) throw new Error(`Run \`pnpm load:test setup\` first (${STATE} not found).`);
  const state = JSON.parse(readFileSync(STATE, "utf8")) as State;
  const base = (args.url ?? "http://localhost:3000").replace(/\/$/, "");
  const seconds = num("seconds", 60);
  const concurrency = num("concurrency", 40);
  const pollEvery = num("poll", 30) * 1000;
  const punches: Sample[] = [];
  const polls: Sample[] = [];
  const uploads: Sample[] = [];
  const started = Date.now();
  const deadline = started + seconds * 1000;
  console.log(
    `Rush: ${state.employees.length} clock-ins over ${seconds}s (concurrency ${concurrency}), ` +
      `${num("terminals", state.serials.length)} terminals polling every ${pollEvery / 1000}s → ${base}`,
  );

  // Terminals: poll for commands on their interval and upload a share of the logs once.
  const perTerminal = Math.ceil(state.userIds.length / state.serials.length);
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Manila",
    dateStyle: "short",
    timeStyle: "medium",
  });
  const serials = state.serials.slice(0, num("terminals", state.serials.length));
  const backlog = "backlog" in args;
  const terminals = serials.map(async (sn, i) => {
    const users = state.userIds.slice(i * perTerminal, (i + 1) * perTerminal);
    // Complete in/out pairs from 3 days ago (beyond the 36 h duty limit), so taps arriving out of
    // order never leave someone looking clocked in for the live punches.
    const day = local.format(new Date(Date.now() - 3 * 86_400_000)).slice(0, 10);
    const lines = users.flatMap((u) => [
      `${u}\t${day} 08:00:00\t0\t1\t0\t0`,
      `${u}\t${day} 17:00:00\t0\t1\t0\t0`,
    ]);
    const upload = (body: string) =>
      timed(() => fetch(`${base}/iclock/cdata?SN=${sn}&table=ATTLOG&Stamp=1`, { method: "POST", body }));
    const sending = backlog
      ? // Back online after an outage: the whole backlog in one request, at a random moment.
        (async () => {
          await new Promise((r) => setTimeout(r, Math.random() * pollEvery));
          uploads.push(await upload(lines.join("\n") + "\n"));
        })()
      : // Realtime=1: each tap is pushed as it happens, spread over the rush.
        Promise.all(
          lines.map(async (line) => {
            await new Promise((r) => setTimeout(r, Math.random() * seconds * 1000));
            uploads.push(await upload(line + "\n"));
          }),
        );
    const polling = (async () => {
      await new Promise((r) => setTimeout(r, Math.random() * pollEvery));
      while (Date.now() < deadline) {
        polls.push(await timed(() => fetch(`${base}/iclock/getrequest?SN=${sn}`)));
        await new Promise((r) => setTimeout(r, pollEvery));
      }
    })();
    await Promise.all([sending, polling]);
  });

  // Employees: spread across the window, at most `concurrency` in flight.
  const queue = [...state.employees];
  const gap = (seconds * 1000) / queue.length;
  const workers = Array.from({ length: concurrency }, async (_, w) => {
    for (let i = w; i < state.employees.length; i += concurrency) {
      const due = started + i * gap;
      if (due > Date.now()) await new Promise((r) => setTimeout(r, due - Date.now()));
      punches.push(
        await timed(() =>
          fetch(`${base}/api/v1/punches`, {
            method: "POST",
            headers: { Authorization: `Bearer ${state.key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              employeeNo: state.employees[i],
              action: "CLOCK_IN",
              clientId: randomUUID(),
            }),
          }),
        ),
      );
    }
  });
  await Promise.all([...workers, ...terminals]);
  const took = (Date.now() - started) / 1000;
  console.log(`\nFinished in ${took.toFixed(1)}s`);
  report("API punches", punches, took);
  report("Terminal uploads", uploads, took);
  report("Terminal polls", polls, took);
  const failed = [...punches, ...uploads, ...polls].filter((s) => s.status !== 200).length;
  if (failed) process.exitCode = 1;
}

async function runCompany(slug: string) {
  const { prisma } = await import("@/server/db");
  const { createApiKey } = await import("@/server/api-auth");
  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) throw new Error(`No company "${slug}". Seed it first: pnpm seed:scale`);
  const base = (args.url ?? "http://localhost:3000").replace(/\/$/, "");
  const origin = (process.env.APP_URL ?? base).replace(/\/$/, "");
  const seconds = num("seconds", 60);
  const people = await prisma.employee.findMany({
    where: { companyId: company.id, status: "ACTIVE", role: "EMPLOYEE" },
    select: {
      employeeNo: true,
      deviceUserId: true,
      email: true,
      fieldWork: true,
      departmentId: true,
      locations: { select: { location: { select: { latitude: true, longitude: true } } } },
    },
    orderBy: { employeeNo: "asc" },
  });
  if ("fresh" in args) {
    // The seeded history ends yesterday: everything from today on came from earlier load tests.
    const today = new Date(
      `${new Intl.DateTimeFormat("en-CA", { timeZone: company.timezone }).format(new Date())}T00:00:00+08:00`,
    );
    const [p, e] = await prisma.$transaction([
      prisma.punch.deleteMany({
        where: {
          companyId: company.id,
          at: { gte: new Date(today.getTime() - 3600_000) },
          NOT: { clientId: { startsWith: "scale:" } },
        },
      }),
      prisma.timeEntry.deleteMany({ where: { companyId: company.id, clockInAt: { gte: today } } }),
    ]);
    console.log(`--fresh: removed ${p.count} punches and ${e.count} time entries from earlier runs today.`);
  }
  const devices = await prisma.attendanceDevice.findMany({
    where: { companyId: company.id },
    select: { serialNumber: true },
  });
  const hrEmails = (
    await prisma.employee.findMany({
      where: { companyId: company.id, role: { in: ["HR", "OWNER"] } },
      select: { email: true },
    })
  ).map((e) => e.email!);
  // Disjoint groups so no one is punched by two channels at once.
  const office = people.filter((p) => !p.fieldWork);
  const phoneGroup = office.slice(0, num("phone", 400));
  const rest = people.filter((p) => !phoneGroup.includes(p));
  const apiGroup = rest.slice(0, num("api", 400));
  const terminalGroup = rest.slice(apiGroup.length, apiGroup.length + num("terminal", 500));
  const { key, row } = await createApiKey(
    company.id,
    "load test (temporary)",
    ["punch", "read"],
    (await prisma.employee.findFirstOrThrow({ where: { companyId: company.id, role: "OWNER" } })).id,
  );

  const samples: Record<string, Sample[]> = {
    "Sign-ins (before the rush)": [],
    "Phone punches": [],
    "API punches": [],
    "Terminal taps": [],
    "HR dashboard": [],
    "HR report": [],
    "HR Excel export": [],
  };
  let started = 0;
  const half = (seconds * 1000) / 2;
  const at = (window: 0 | 1) => started + window * half + Math.random() * half * 0.9;
  const sleepUntil = (t: number) => new Promise((r) => setTimeout(r, Math.max(0, t - Date.now())));
  console.log(
    `${company.name}: ${phoneGroup.length} phone users, ${apiGroup.length} API, ${terminalGroup.length} terminal taps ` +
      `(${devices.length} terminals), ${num("hr", 3)} HR users, over ${seconds}s → ${base}`,
  );

  async function signIn(email: string) {
    const s = await timed(() =>
      fetch(`${base}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ email, password: args.password ?? "demo12345" }),
        redirect: "manual",
      }).then((res) => {
        cookies.set(email, (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; "));
        return res;
      }),
    );
    samples["Sign-ins (before the rush)"]!.push(s);
    return cookies.get(email) ?? "";
  }
  const cookies = new Map<string, string>();

  // People's phones stay signed in (sessions last 30 days), so they sign in before the rush, not
  // during it: 20 at a time, like a morning of people opening the app.
  const hrUsers = Array.from({ length: num("hr", 3) }, (_, i) => hrEmails[i % hrEmails.length]!);
  const toSignIn = [...phoneGroup.map((p) => p.email!), ...hrUsers];
  for (let i = 0; i < toSignIn.length; i += 20) await Promise.all(toSignIn.slice(i, i + 20).map(signIn));
  started = Date.now();

  const phone = phoneGroup.map(async (p) => {
    const cookie = cookies.get(p.email!) ?? "";
    const loc = p.locations[0]?.location;
    for (const [action, window] of [
      ["CLOCK_IN", 0],
      ["CLOCK_OUT", 1],
    ] as const) {
      await sleepUntil(Math.max(at(window), Date.now()));
      samples["Phone punches"]!.push(
        await timed(() =>
          fetch(`${base}/api/punch`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
            body: JSON.stringify({
              action,
              clientId: randomUUID(),
              lat: loc?.latitude ?? null,
              lng: loc?.longitude ?? null,
              accuracy: 12,
            }),
          }),
        ),
      );
    }
  });
  const api = apiGroup.map(async (p) => {
    for (const [action, window] of [
      ["CLOCK_IN", 0],
      ["CLOCK_OUT", 1],
    ] as const) {
      await sleepUntil(at(window));
      samples["API punches"]!.push(
        await timed(() =>
          fetch(`${base}/api/v1/punches`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ employeeNo: p.employeeNo, action, clientId: randomUUID() }),
          }),
        ),
      );
    }
  });
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone: company.timezone,
    dateStyle: "short",
    timeStyle: "medium",
  });
  const terminal = terminalGroup.map(async (p, i) => {
    const sn = devices[i % devices.length]!.serialNumber;
    for (const window of [0, 1] as const) {
      await sleepUntil(at(window));
      const line = `${p.deviceUserId}\t${local.format(new Date())}\t0\t1\t0\t0\n`;
      samples["Terminal taps"]!.push(
        await timed(() =>
          fetch(`${base}/iclock/cdata?SN=${sn}&table=ATTLOG&Stamp=1`, { method: "POST", body: line }),
        ),
      );
    }
  });
  const hr = hrUsers.map(async (email) => {
    const cookie = cookies.get(email) ?? "";
    const get = (name: string, path: string) =>
      timed(() => fetch(`${base}${path}`, { headers: { Cookie: cookie }, redirect: "manual" })).then((s) =>
        samples[name]!.push(s),
      );
    while (Date.now() < started + seconds * 1000) {
      await get("HR dashboard", "/app");
      await get("HR report", "/app/reports");
      await get("HR Excel export", "/api/export/attendance?format=xlsx");
      await new Promise((r) => setTimeout(r, num("hr-every", 20) * 1000));
    }
  });
  await Promise.all([...phone, ...api, ...terminal, ...hr]);
  await prisma.apiKey.delete({ where: { id: row.id } });
  const took = (Date.now() - started) / 1000;
  console.log(`\nFinished in ${took.toFixed(1)}s`);
  for (const [name, list] of Object.entries(samples)) if (list.length) report(name, list, took);
  const failed = Object.values(samples)
    .flat()
    .filter((s) => s.status !== 200).length;
  if (failed) process.exitCode = 1;
  await prisma.$disconnect();
}

const commands: Record<string, () => Promise<void>> = {
  setup,
  run: () => (args.company ? runCompany(args.company) : run()),
  cleanup,
};
if (!commands[cmd]) {
  console.error("Usage: pnpm load:test <setup|run|cleanup> [--flags]");
  process.exit(1);
}
commands[cmd]().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

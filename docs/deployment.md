# Deploying ClockTime to production

This guide covers the cloud services ClockTime needs, every environment variable, and how the system is sized for 1,000+ employees. The client-facing security summary is in `docs/security-privacy.md`; disaster recovery is in `docs/runbooks/restore.md`.

## 1. Architecture

```
 Phones / browsers / kiosks ─┐
 ZKTeco terminals (ADMS) ────┼──►  Vercel (Next.js, region sin1 Singapore)
 Payroll / HRIS (REST API) ──┘        │  app pages, API, /iclock terminal endpoints
                                      │  cron jobs (exceptions, auto clock-out, cleanup…)
                                      ▼
            Neon Postgres 16 (aws-ap-southeast-1 Singapore)
              pooled endpoint (PgBouncer) for the app, direct endpoint for migrations
              point-in-time restore + nightly encrypted dump to R2 (GitHub Actions)
                                      │
   Cloudflare R2 (payslips, punch photos, backups)   Resend (email)   PayMongo (billing)
```

**Why Singapore:** it is the closest region to the Philippines on both Vercel and Neon, and the app and database must be in the same region. A US-region function talking to an Asian database adds about 200 ms to every query, and a punch makes 10–20 of them.

**Why a pooled connection:** serverless functions scale out to many instances, and each opens up to `DATABASE_POOL_MAX` connections. The pooler funnels them into a small number of real Postgres connections. ClockTime's advisory locks are transaction-scoped (`pg_advisory_xact_lock`), so they work through PgBouncer in transaction mode.

## 2. Services to create

| #   | Service                                         | Plan                                      | What to set up                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Neon** (neon.tech)                            | Launch or Scale                           | <ul><li>Project in **AWS Asia Pacific (Singapore)**, Postgres 16.</li><li>Copy the **pooled** connection string (host contains `-pooler`) and the **direct** one.</li><li>Autoscaling 0.5–4 CU. Point-in-time restore of 7 days or more.</li></ul> |
| 2   | **Vercel**                                      | Pro (cron jobs every 15 minutes need Pro) | <ul><li>Import the GitHub repo.</li><li>Function region comes from `vercel.json` (`sin1`).</li><li>Add the environment variables below for **Production**, with separate test values for **Preview**.</li></ul>                                    |
| 3   | **Cloudflare R2**                               | Pay as you go                             | <ul><li>Bucket `clocktime-files`, private.</li><li>Bucket `clocktime-backups`, with a lifecycle rule deleting `backups/` after **35 days**.</li><li>An API token with read/write on each bucket.</li></ul>                                         |
| 4   | **Resend**                                      | Pro                                       | <ul><li>Verify the sending domain (SPF, DKIM, DMARC).</li><li>Create an API key.</li></ul>                                                                                                                                                         |
| 5   | **PayMongo**                                    | Live account                              | <ul><li>Live secret and public keys.</li><li>A webhook to `https://<domain>/api/webhooks/paymongo`; copy its secret.</li></ul>                                                                                                                     |
| 6   | **Domain**                                      | —                                         | <ul><li>Point `app.<domain>` to Vercel.</li><li>Use that address for `APP_URL` and for the terminals' server address.</li></ul>                                                                                                                    |
| 7   | **Uptime monitor** (Better Stack, UptimeRobot…) | Free                                      | <ul><li>Check `https://<domain>/api/health` every minute and alert on non-200.</li></ul>                                                                                                                                                           |
| 8   | **Sentry** (optional)                           | Free tier is enough                       | <ul><li>Create a Next.js project; set `SENTRY_DSN` in Vercel. Captures server errors from pages, routes and cron jobs; leave empty to disable.</li></ul>                                                                                           |

## 3. Environment variables

**Required** means the app refuses to start on the live site without it. These checks run when `VERCEL_ENV` (set by Vercel) or `DEPLOY_ENV` is `production`.

| Variable                                                                | Required                 | What it is                                                                    | How to get it                                                                                      |
| ----------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                          | Yes                      | App database connection, **pooled**                                           | Neon → Connection details → Pooled. Add `?sslmode=require`.                                        |
| `DIRECT_DATABASE_URL`                                                   | Yes                      | Direct connection used by migrations                                          | Neon → Connection details → Direct                                                                 |
| `DATABASE_POOL_MAX`                                                     | —                        | Connections per server instance (default 5)                                   | Keep instances × this under the pooler limit (Neon pooler: 10,000 clients)                         |
| `APP_URL`                                                               | Yes                      | Public `https://` address                                                     | e.g. `https://app.clocktime.ph`                                                                    |
| `BETTER_AUTH_SECRET`                                                    | Yes                      | Signs sessions and cookies                                                    | `openssl rand -base64 32`                                                                          |
| `DATA_ENCRYPTION_KEY`                                                   | Yes                      | AES-256 key for government IDs, bank accounts, RFID cards and webhook secrets | `openssl rand -base64 32`. **Never change it after go-live.** Keep a copy in the password manager. |
| `CRON_SECRET`                                                           | Yes                      | Protects `/api/cron/*` (Vercel Cron sends it automatically)                   | `openssl rand -hex 24`                                                                             |
| `EMAIL_PROVIDER`                                                        | Yes (`resend` or `smtp`) | Email transport                                                               | —                                                                                                  |
| `RESEND_API_KEY`                                                        | With `resend`            | Resend API key                                                                | Resend → API keys                                                                                  |
| `SMTP_URL`                                                              | With `smtp`              | Any SMTP relay (Amazon SES, Google Workspace, Mailgun…)                       | `smtps://user:pass@smtp.example.com:465`                                                           |
| `EMAIL_FROM`                                                            | —                        | Sender address                                                                | `ClockTime <no-reply@your-domain>`, on the verified domain                                         |
| `STORAGE_PROVIDER`                                                      | Yes (`s3`)               | File storage                                                                  | —                                                                                                  |
| `S3_ENDPOINT`                                                           | Yes                      | R2 S3 endpoint                                                                | `https://<account-id>.r2.cloudflarestorage.com`                                                    |
| `S3_REGION`                                                             | —                        | `auto` for R2                                                                 | —                                                                                                  |
| `S3_BUCKET`                                                             | Yes                      | App files bucket                                                              | `clocktime-files`                                                                                  |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                              | Yes                      | R2 API token for that bucket                                                  | R2 → Manage API tokens                                                                             |
| `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_ENDPOINT`                             | —                        | Only for self-hosted S3 (the local production copy)                           | Leave unset for R2                                                                                 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`    | For push notifications   | Web Push keys                                                                 | `pnpm dlx web-push generate-vapid-keys`. Subject is `mailto:support@…`.                            |
| `PAYMONGO_SECRET_KEY`, `PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET` | For self-serve billing   | PayMongo live keys                                                            | PayMongo dashboard → Developers                                                                    |
| `SUPER_ADMIN_EMAILS`                                                    | —                        | Who gets the ClockTime operator console                                       | Comma-separated emails                                                                             |
| `NEXT_PUBLIC_SALES_EMAIL`                                               | —                        | Contact for Enterprise quotes                                                 | e.g. `sales@your-domain`                                                                           |
| `SENTRY_DSN`                                                            | —                        | Server-side error monitoring via Sentry. Empty = disabled entirely.           | sentry.io → create a Next.js project → copy the DSN                                                 |
| `DEPLOY_ENV`                                                            | Only off Vercel          | Set to `production` to turn on the startup checks                             | —                                                                                                  |
| `BILLING_TEST_MODE`, `AUTH_RATE_LIMIT`                                  | **Must be unset**        | Test switches; the app refuses to start if they're set in production          | —                                                                                                  |

**GitHub repository secrets** (Settings → Secrets → Actions), used by the nightly backup in `.github/workflows/backup.yml`:

| Secret                                                      | Value                                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `BACKUP_DATABASE_URL`                                       | Neon **direct** connection string (a read-only role is enough)                                                           |
| `BACKUP_PASSPHRASE`                                         | Long random passphrase for backup encryption. Keep a copy in the password manager; without it backups can't be restored. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 token with write access to the backups bucket                                                                         |
| `R2_BACKUP_BUCKET`                                          | `clocktime-backups`                                                                                                      |

Store every secret in the team password manager as well. Never commit `.env` files or paste keys into chat or tickets.

## 4. First deployment

1. Create the services in section 2 and add the variables in section 3 in Vercel (Production).
2. Run the migrations from your machine against the **direct** URL:
   ```bash
   DIRECT_DATABASE_URL="postgresql://…" DATABASE_URL="postgresql://…" pnpm exec prisma migrate deploy
   ```
   Don't run `prisma db seed` in production; it creates the demo company.
3. Deploy: push to `main`, or promote a preview in Vercel.
4. Open `https://<domain>/api/health`. Expect `{"status":"ok"}`. If it returns 503, `configError` names the missing variables, never their values.
5. Sign up the first owner account. Add its email to `SUPER_ADMIN_EMAILS` and redeploy to get the operator console.
6. In Vercel → Settings → Cron Jobs, confirm the six jobs from `vercel.json` are listed.
7. In GitHub → Actions, run **Nightly database backup** once by hand. Confirm it uploads and passes its own restore check.
8. Enterprise customers: set the company's plan in the operator console, then in the company's **Settings**:
   - turn on **Require two-step verification**
   - set the GPS retention period
   - add branches with branch codes
   - register terminals

### Each release

```bash
pnpm exec prisma migrate deploy   # against DIRECT_DATABASE_URL, before or as the new code goes live
```

So far every migration only adds tables, columns and indexes, so each can be applied while the previous version is still running. Check that this still holds for each new migration before you deploy it. Add the migration step to the Vercel build command once you're comfortable with it:

```
prisma migrate deploy && next build
```

with `DIRECT_DATABASE_URL` set for Production.

## 5. Biometric terminals (ZKTeco ADMS)

On each terminal, go to **Comm. → Cloud Server Setting** and set:

- **Server address:** your domain
- **Port:** 443
- **HTTPS:** on

Then add the terminal's serial number in **Settings → Terminals**. Unknown serial numbers are refused until they are claimed.

- **Polling:** terminals poll every 30 s (`Delay=30`) and push each tap as it happens (`Realtime=1`). Logs saved while offline upload on reconnect, without duplicates.
- **Firmware without HTTPS:** test one unit against a preview deployment first. If the firmware can only talk plain HTTP, put a small HTTP→HTTPS relay in front (e.g. a Cloudflare Worker on a dedicated hostname). Keep the IP allowlist per terminal.

## 6. Capacity and scaling

### Sizing (1,000 employees, 100 terminals)

|                              | Per day             | Per year                           | Storage                      |
| ---------------------------- | ------------------- | ---------------------------------- | ---------------------------- |
| Punches (about 4 per person) | 4,000               | 1.5M                               | about 1 GB with indexes      |
| Time entries                 | 2,000               | 0.7M                               | about 0.5 GB                 |
| Audit log                    | about 2,000         | 0.7M                               | about 0.5 GB                 |
| Punch photos (if required)   | 2,000 × about 60 KB | deleted after the retention period | about 4 GB per 30 days in R2 |

Postgres handles this comfortably on a single Neon instance (0.5–2 CU). The pressure points are concurrency at shift start and terminal polling, not data volume.

### Measured load (`pnpm load:test`)

**Setup**

- One local production server (`next start`) with a 5-connection pool, so this is pessimistic.
- 1,000 employees clocking in through the API over 60 seconds.
- 100 terminals polling every 30 s and pushing 2,000 taps as they happen.

| Traffic        | Requests | p50   | p95    | p99    | Errors |
| -------------- | -------- | ----- | ------ | ------ | ------ |
| API punches    | 1,000    | 72 ms | 368 ms | 471 ms | 0      |
| Terminal taps  | 2,000    | 92 ms | 450 ms | 559 ms | 0      |
| Terminal polls | 200      | 23 ms | 114 ms | 137 ms | 0      |

Punches alone (no terminals) ran at p95 **41 ms**.

**Outage recovery** (`--backlog`: all 100 terminals uploading their whole log at once):

- Uploads: p50 0.86 s
- Live punches kept p95 213 ms
- 0 errors

**Before quoting a large client, run the same test against a preview deployment** that uses the real Neon and Vercel setup:

```bash
DATABASE_URL="<preview db>" pnpm load:test setup --employees 1000 --terminals 100
pnpm load:test run --url https://<preview-url> --seconds 60
pnpm load:test cleanup
```

### What keeps it fast

- **Region and connections**
  - App and database are co-located in Singapore.
  - Pooled connections: `DATABASE_POOL_MAX=5` per Vercel instance (Vercel adds instances under load). Long-running servers, such as the local copy or a VM, need about 20 each.
  - Transactions wait up to 10–15 s for a free connection instead of failing during a rush.
- **Locking:** each employee's punches are serialized by a per-employee lock, so the whole company never waits on one lock.
- **Terminal traffic**
  - Each upload loads only the people in it.
  - Last-seen time is written at most once a minute per terminal.
  - Polling every 30 s.
- **Indexes** for every hot query: punches by company and time, open entries, leave overlap, exceptions, session cleanup.
- **Background work**
  - Webhooks and notifications are sent after the response.
  - Cron jobs have a 300-second limit and process bounded batches.
- **Shared state:** sign-in rate limits and API limits are stored in Postgres, so they hold across instances.
  - API keys allow 120 requests per minute, or 1,200 on Enterprise.
  - For bulk transfers, use `POST /api/v1/attendance-logs` (many records per request).

### When to scale further

| Signal                                                                        | Action                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Neon CPU above 70% at shift start                                             | Raise the autoscaling max (4 → 8 CU)                                           |
| Reports or exports slow down the app                                          | Add a Neon read replica and point report queries at it                         |
| More than about 10,000 employees on one deployment, or `Punch` above 50M rows | Partition `Punch` and `AuditLog` by month                                      |
| Webhook or terminal backlogs build up                                         | Move deliveries and attendance rebuilds to a queue (Upstash QStash or Inngest) |
| Dashboard over 1 s with many branches                                         | Cache the nationwide rollup (Redis or Vercel KV) for 30–60 s                   |

## 7. Go-live checklist

**Infrastructure and configuration**

- [ ] Vercel region `sin1`, Neon in Singapore, both confirmed. `/api/health` shows `"region":"sin1"`.
- [ ] All required variables set. `/api/health` returns 200.
- [ ] `DATA_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET` and `BACKUP_PASSPHRASE` stored in the password manager.
- [ ] `BILLING_TEST_MODE` and `AUTH_RATE_LIMIT` unset.
- [ ] Migrations applied. No demo seed in production.

**Operations**

- [ ] Six cron jobs visible in Vercel. The first `exceptions` run is green in the logs.
- [ ] Backup workflow run once by hand. R2 lifecycle rule (35 days) active.
- [ ] Uptime monitor on `/api/health`.

**External services**

- [ ] Resend domain verified. A test password-reset email arrives.
- [ ] PayMongo webhook delivered (Settings → Plan & billing shows the payment).

**Validation**

- [ ] One real terminal tested end to end: handshake, tap, roster sync.
- [ ] Load test run against the preview deployment.
- [ ] Enterprise company: 2FA required, retention set, approval levels set.

## 8. Local production rehearsal (Docker)

Before moving to the cloud, run the same production build on your own machine with its own database, at full scale. Everything is in `docker-compose.prod.yml`. You need Docker Desktop (Windows/macOS) or Docker Engine (Linux), with at least 4 CPUs, 8 GB of memory and 10 GB of free disk.

| Cloud                      | Local stand-in                                                      |
| -------------------------- | ------------------------------------------------------------------- |
| Vercel (several instances) | `app1`, `app2` behind `proxy` (nginx), the same image as production |
| Vercel Cron                | `cron` (runs the `vercel.json` schedules)                           |
| Neon pooled endpoint       | `pgbouncer` (transaction mode)                                      |
| Neon Postgres 16           | `postgres` (with `pg_stat_statements`)                              |
| Cloudflare R2              | `s3` (SeaweedFS, S3 API)                                            |
| Resend                     | `mailpit` (catches every email)                                     |

### Start it

```bash
cp .env.prod.example .env.prod      # local-only secrets; never reuse them in the cloud
docker compose -f docker-compose.prod.yml up -d --build        # first build: about 5 minutes
docker compose -f docker-compose.prod.yml ps                   # wait for app1/app2 "healthy"
```

| Open                             | What                                                                  |
| -------------------------------- | --------------------------------------------------------------------- |
| http://localhost:8080            | ClockTime                                                             |
| http://localhost:8080/api/health | Health check through the proxy                                        |
| http://localhost:8025            | Mailpit: invites, password resets, payslips                           |
| `localhost:5433`                 | Postgres (`clocktime` / `clocktime-local`) for psql, pg_dump or a GUI |

### Load 1,500 employees with 3 months of history

```bash
docker compose -f docker-compose.prod.yml run --rm seed
# other sizes: … run --rm seed --employees 5000 --days 90
# recompute payroll only: … run --rm seed --payroll-only
```

This creates **Scale Test Corp**:

- **Structure:** 4 regions, 12 branches with terminals, 6 departments.
- **People:**
  - office staff on fingerprint terminals
  - a night warehouse crew crossing midnight
  - 24-hour guards on RFID cards
  - drivers and sales on phones, some offline
- **Attendance:** 90 days of shifts and punches ending yesterday, built by the production pairing engine. It includes lateness, absences, missing clock-outs, long duties, leave, overtime, corrections, schedule changes, and the last cutoff's payroll.

**Sign-ins** (password `demo12345` for all):

| Account                                     | Role                                              |
| ------------------------------------------- | ------------------------------------------------- |
| `owner@scale.demo.clocktime.ph`             | Owner, also super admin locally                   |
| `hr@scale.demo.clocktime.ph`                | HR, nationwide                                    |
| `timekeeper@scale.demo.clocktime.ph`        | Timekeeper                                        |
| `supervisor.mnl-hq@scale.demo.clocktime.ph` | Branch supervisor; one per branch code            |
| `emp00100@scale.demo.clocktime.ph`          | Employee; `emp00016`–`emp01500` are all employees |

Kiosk PINs for office staff are `100000 + employee number`; for example, employee 00100 has PIN `100100`.

### Test the shift-start rush

```bash
docker compose -f docker-compose.prod.yml run --rm loadtest --seconds 300 --fresh   # 5-minute rush (realistic)
docker compose -f docker-compose.prod.yml run --rm loadtest --seconds 60 --fresh    # stress: everything in 1 minute
```

All of this runs at once:

- people signing in and punching from their phones
- clock-ins through the API
- fingerprint terminal taps
- HR opening the nationwide dashboard, the cutoff report and the Excel export

Phone users sign in before the clock starts, because real phones stay signed in for 30 days. During the run, everyone clocks in during the first half and out during the second. `--fresh` clears today's punches from earlier runs first, so every run starts from the same state.

The run reports p50, p95 and p99 latency and errors for each kind of traffic. Options:

- `--phone`, `--api`, `--terminal`: how many people punch each way (400, 400 and 500 by default)
- `--hr`: how many HR users load reports during the rush (3 by default)
- `--hr-every`: how often each HR user refreshes, in seconds (20 by default)

Then look at the database:

```bash
docker compose -f docker-compose.prod.yml run --rm --entrypoint pnpm migrate db:report --reset   # before a run
docker compose -f docker-compose.prod.yml run --rm --entrypoint pnpm migrate db:report           # after
```

It shows:

- table sizes
- the slowest queries
- tables read by full scans
- unused indexes

### Measured on the rehearsal (October 2026)

**Setup**

- Scale Test Corp: 1,500 people, 90 days of history.
- Same layout as Docker: 2 app instances behind nginx, PgBouncer in transaction mode, Postgres 16.
- All on one 4-core machine, which also runs the load generator. A desktop with more cores, or the cloud, does better.

**Seeding:** 6.6 minutes to create:

- 280,000 punches
- 91,000 time entries
- 94,000 shifts
- 6,900 exceptions
- 21,000 overtime requests
- the last cutoff's payroll

**Single requests, nationwide** (all 1,500 people):

| Request                        | Time                                     | Page size |
| ------------------------------ | ---------------------------------------- | --------- |
| Punch (phone, API or terminal) | 40–100 ms                                | —         |
| Sign-in                        | about 110 ms                             | —         |
| Dashboard                      | 0.3 s                                    | 250 KB    |
| Approvals inbox                | 0.14 s                                   | 410 KB    |
| Timesheets                     | 4 s                                      | 440 KB    |
| Cutoff report                  | 5 s; repeats within a minute are instant | 770 KB    |
| Excel export                   | 9 s                                      | 2.2 MB    |
| Payroll, 1,500 payslips        | 8.5 s                                    | —         |

**Five-minute rush:**

- 1,300 people clocking in and out: 800 by phone, 800 through the API, 1,000 terminal taps.
- 3 HR users refreshing the nationwide dashboard, report and Excel export every 20 s.
- Result: **all 3,084 requests succeeded**, with punches at p50 40–60 ms.
- p95 was 4–8 s, while nationwide Excel exports ran.

**One-minute stress test:** the same traffic squeezed into 60 s, about 40× a real rush.

- **All 3,018 requests still succeeded**, with p50 2.5–5 s.
- It slows down under overload but doesn't fail.

**Database:** about 6% of one core during the rush (19 s of query time in 5 minutes), about 32 queries per request, and no full-table scans. For this size, Postgres has plenty of room; the limit is app CPU, so add app instances before a bigger database.

**Fixed because of this rehearsal**, all before any customer would have hit them:

- **Missed clock-outs broke punching:** anyone with a missed clock-out older than a few days couldn't punch at all (the attendance rebuild failed).
- **Payroll timed out** for 1,000+ people.
- **Missing indexes:** deleting a company took minutes, and breaks were read by full table scans.
- **Slow and oversized pages:** reports and timesheets were 2–3× slower; the dashboard and approvals were 4–30 MB pages.
- **Wasted rewrites:** every punch rewrote all duties in its 36-hour window.
- **Proxy dropped busy instances:** nginx took slow-but-healthy instances out of service.

Also watch `docker stats` during a run to see CPU and memory per service.

### Day-to-day commands

```bash
docker compose -f docker-compose.prod.yml logs -f app1 cron    # app and scheduled-job logs
docker compose -f docker-compose.prod.yml up -d --build        # after pulling new code (migrations run first)
docker compose -f docker-compose.prod.yml down                 # stop; data is kept in volumes
docker compose -f docker-compose.prod.yml down -v              # stop and DELETE the local database and files
```

### Moving to the cloud

**Option A, recommended: start clean on Neon.** The rehearsal data is test data; don't migrate it.

1. Create the Neon project and the other services (section 2).
2. Run `prisma migrate deploy` against Neon (section 4).
3. Sign up the real owner account.
4. Import the real employees: **Team → Import CSV**, up to 2,000 rows on Enterprise, or `PUT /api/v1/employees/{employeeNo}` from the HR system.
5. Import schedules with **Schedule → Import**.

**Option B: carry the local database over**, e.g. after a pilot on the local copy with real people.

1. Dump the local database:
   ```bash
   docker compose -f docker-compose.prod.yml exec postgres \
     pg_dump -U clocktime --format=custom --no-owner --no-privileges clocktime > clocktime.dump
   ```
2. Restore it into an empty Neon database using the **direct** URL:
   ```bash
   pg_restore --no-owner --no-privileges --jobs 4 -d "$NEON_DIRECT_URL" clocktime.dump
   DIRECT_DATABASE_URL="$NEON_DIRECT_URL" DATABASE_URL="$NEON_DIRECT_URL" pnpm exec prisma migrate deploy
   ```
3. Use **the same `DATA_ENCRYPTION_KEY` and `BETTER_AUTH_SECRET`** in Vercel as in `.env.prod`. Otherwise government IDs, bank accounts, RFID cards and webhook secrets can't be decrypted, and everyone must sign in again. Once you've moved them, treat those two secrets as production secrets.
4. Copy the files bucket from SeaweedFS to R2 (payslips and photos). For example, use `rclone sync` with two S3 remotes, or regenerate payslips from the pay runs.
5. Check the move:
   - `/api/health` returns 200.
   - Row counts match: `pnpm db:report` against both databases.
   - **Settings → Audit log → Verify integrity** passes for each company.

Afterwards, run the same load test against a Vercel preview deployment that uses Neon (section 6) and compare the numbers with the local ones.

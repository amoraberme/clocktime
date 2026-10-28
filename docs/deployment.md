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

## 3. Environment variables

**Required** means the app refuses to start on the live site without it. These checks run when `VERCEL_ENV` (set by Vercel) or `DEPLOY_ENV` is `production`.

| Variable                                                                | Required               | What it is                                                                    | How to get it                                                                                      |
| ----------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                          | Yes                    | App database connection, **pooled**                                           | Neon → Connection details → Pooled. Add `?sslmode=require`.                                        |
| `DIRECT_DATABASE_URL`                                                   | Yes                    | Direct connection used by migrations                                          | Neon → Connection details → Direct                                                                 |
| `DATABASE_POOL_MAX`                                                     | —                      | Connections per server instance (default 5)                                   | Keep instances × this under the pooler limit (Neon pooler: 10,000 clients)                         |
| `APP_URL`                                                               | Yes                    | Public `https://` address                                                     | e.g. `https://app.clocktime.ph`                                                                    |
| `BETTER_AUTH_SECRET`                                                    | Yes                    | Signs sessions and cookies                                                    | `openssl rand -base64 32`                                                                          |
| `DATA_ENCRYPTION_KEY`                                                   | Yes                    | AES-256 key for government IDs, bank accounts, RFID cards and webhook secrets | `openssl rand -base64 32`. **Never change it after go-live.** Keep a copy in the password manager. |
| `CRON_SECRET`                                                           | Yes                    | Protects `/api/cron/*` (Vercel Cron sends it automatically)                   | `openssl rand -hex 24`                                                                             |
| `EMAIL_PROVIDER`                                                        | Yes (`resend`)         | Email transport                                                               | —                                                                                                  |
| `RESEND_API_KEY`                                                        | Yes                    | Resend API key                                                                | Resend → API keys                                                                                  |
| `EMAIL_FROM`                                                            | —                      | Sender address                                                                | `ClockTime <no-reply@your-domain>`, on the verified domain                                         |
| `STORAGE_PROVIDER`                                                      | Yes (`s3`)             | File storage                                                                  | —                                                                                                  |
| `S3_ENDPOINT`                                                           | Yes                    | R2 S3 endpoint                                                                | `https://<account-id>.r2.cloudflarestorage.com`                                                    |
| `S3_REGION`                                                             | —                      | `auto` for R2                                                                 | —                                                                                                  |
| `S3_BUCKET`                                                             | Yes                    | App files bucket                                                              | `clocktime-files`                                                                                  |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                              | Yes                    | R2 API token for that bucket                                                  | R2 → Manage API tokens                                                                             |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`    | For push notifications | Web Push keys                                                                 | `pnpm dlx web-push generate-vapid-keys`. Subject is `mailto:support@…`.                            |
| `PAYMONGO_SECRET_KEY`, `PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET` | For self-serve billing | PayMongo live keys                                                            | PayMongo dashboard → Developers                                                                    |
| `SUPER_ADMIN_EMAILS`                                                    | —                      | Who gets the ClockTime operator console                                       | Comma-separated emails                                                                             |
| `NEXT_PUBLIC_SALES_EMAIL`                                               | —                      | Contact for Enterprise quotes                                                 | e.g. `sales@your-domain`                                                                           |
| `DEPLOY_ENV`                                                            | Only off Vercel        | Set to `production` to turn on the startup checks                             | —                                                                                                  |
| `BILLING_TEST_MODE`, `AUTH_RATE_LIMIT`                                  | **Must be unset**      | Test switches; the app refuses to start if they're set in production          | —                                                                                                  |

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
  - Pooled connections; `DATABASE_POOL_MAX=5` per instance.
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

# ClockTime

Time clock, scheduling and Philippine payroll for small businesses: a multi-tenant SaaS installable as a phone app (PWA).

- **Clock in/out** from a phone, the web or a shared kiosk tablet (PIN or QR badge), with a GPS stamp, geofencing and offline punches
- **Scheduling**: drag-and-drop week builder, recurring shifts, open shifts, swaps, confirmations, availability
- **Timesheets & approvals** with an exception inbox (missed punches, lateness, long breaks, unapproved overtime)
- **PH payroll**: DOLE premiums (overtime, night differential, rest day and holiday pay), SSS, PhilHealth, Pag-IBIG, BIR withholding tax, payslips, 13th-month pay
- **Plans** (Free / Starter / Pro) billed through PayMongo

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 + PostgreSQL 16 · Better Auth · Tailwind CSS 4 · Vitest · Playwright

## Getting started

```bash
cp .env.example .env            # then edit DATABASE_URL and the secrets
pnpm install
pnpm db:migrate                 # create tables
pnpm db:seed                    # statutory tables, PH holidays, demo company
pnpm dev                        # http://localhost:3000
```

Demo logins (password `demo12345`): `owner@demo.clocktime.ph` (owner), `jose@demo.clocktime.ph` (manager), `ana@demo.clocktime.ph` (employee). Demo company code: `DEMO2026`. Kiosk PINs are `1001`–`1007` in team order (Maria = 1001, Ana = 1003).

### Enterprise demo and sample cutoff report

```bash
pnpm demo:enterprise   # "Demo Logistics Corp": 4 regions, terminals, 24h guards, drivers, a full cutoff
pnpm report:sample     # writes docs/samples/clocktime-cutoff-report-sample.xlsx (+ CSVs)
```

Sign in as `hr@logistics.demo.clocktime.ph`, `timekeeper@…`, `supervisor.cebu@…` or `owner@…` (password `demo12345`).

## Scripts

| Command                                    | What it does                                      |
| ------------------------------------------ | ------------------------------------------------- |
| `pnpm dev`                                 | Dev server                                        |
| `pnpm build && pnpm start`                 | Production build and server                       |
| `pnpm lint` / `pnpm typecheck`             | ESLint / TypeScript                               |
| `pnpm test`                                | Unit + integration tests (Vitest, needs Postgres) |
| `pnpm test:e2e`                            | End-to-end tests (Playwright, builds must exist)  |
| `pnpm db:migrate` / `db:seed` / `db:reset` | Database                                          |

## Project layout

```
src/app/            routes: (auth), onboarding, app/ (managers), me/ (employees), kiosk/, admin/, api/
src/server/         server-only code: db, auth, tenant scoping, context, audit, services/
src/lib/            shared logic: time zones, pay engine (lib/pay), geo, validation, entitlements
src/config/plans.ts plan prices, limits and feature flags
prisma/             schema, migrations, seed
tests/              unit, integration, e2e
```

### Multi-tenancy

Every tenant row has `companyId`. Server code reads and writes through `ctx.db` (`src/server/tenant.ts`), a Prisma client extension that adds the company filter to every query and sets `companyId` on every create.

### Statutory rates

SSS, PhilHealth, Pag-IBIG, BIR withholding and DOLE premium tables live in `src/lib/pay/statutory.ts` and `premiums.ts`. They're seeded into the `StatutoryTable` table with effective dates. **Have a Philippine payroll accountant verify them before running live payroll.**

## Deploying to production

1. **Database**: create a Postgres 16 database (Neon or Supabase) and set `DATABASE_URL`. Run `pnpm db:deploy`, then `NODE_ENV=production pnpm db:seed`, which loads the statutory tables and holidays only.
2. **Hosting** (Vercel recommended): import the repo and set every variable in `.env.example`:
   - `APP_URL`: your domain, e.g. `https://app.clocktime.ph`
   - `BETTER_AUTH_SECRET`, `DATA_ENCRYPTION_KEY`: generate each with `openssl rand -base64 32`. Never change the encryption key after launch; encrypted IDs depend on it.
   - `CRON_SECRET`: Vercel Cron sends it automatically. `vercel.json` schedules the jobs. Jobs that run every 15 minutes (exceptions, auto clock-out, reminders) need Vercel Pro; on Hobby, change them to daily.
   - `SUPER_ADMIN_EMAILS`: your own email, which unlocks `/admin`.
3. **Email**: set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and `EMAIL_FROM` (a verified domain).
4. **File storage** (punch photos, payslips): set `STORAGE_PROVIDER=s3` plus the `S3_*` variables (Cloudflare R2 works).
5. **Push notifications**: run `pnpm dlx web-push generate-vapid-keys`, then set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
6. **Payments (PayMongo)**:
   - Set `PAYMONGO_SECRET_KEY` and `PAYMONGO_PUBLIC_KEY`.
   - Create a webhook for `checkout_session.payment.paid` pointing to `https://<domain>/api/webhooks/paymongo`, and set `PAYMONGO_WEBHOOK_SECRET`.
   - Without keys, checkout runs in test mode in development only. Never set `BILLING_TEST_MODE` on a live site.
7. **Before running real payroll**: have a Philippine payroll accountant verify the tables at `/admin/statutory` and the holiday list at `/admin/holidays`.

### Billing model

Plans are prepaid monthly or yearly through PayMongo Checkout, which takes GCash, Maya, GrabPay or card. Renewal reminders go out 7 days and 1 day before expiry. A lapsed company becomes past due with a 7-day grace period, then drops to Free features; no data is deleted. Super-admins can record bank-transfer payments manually in `/admin`.

**Not yet built:** card auto-renewal through the PayMongo Subscriptions API. PayMongo has to enable that API on your account first, and payments in this build are verified only with signed webhook fixtures in tests.

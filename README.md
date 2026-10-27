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

Demo logins (password `demo12345`): `owner@demo.clocktime.ph` (owner), `jose@demo.clocktime.ph` (manager), `ana@demo.clocktime.ph` (employee). Demo company code: `DEMO2026`.

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

# Hraj Fotbal

A booking platform for pickup football in Prague — the thing that replaced a
WhatsApp thread. An organizer publishes a game; players claim a seat, pay by
card or with a credit, bring guests, and cancel inside a policy window that the
database enforces rather than the screen.

Next.js App Router · Supabase (Postgres, RLS, plpgsql RPCs) · Stripe embedded
checkout · Resend. Volt-on-black, mobile-first, four languages.

> **Read `CLAUDE.md` before changing anything.** It is not a tour of the code —
> it is the handful of rules that are load-bearing and the mistakes that were
> expensive, and most of them fail silently rather than loudly. `SCOPE.md` is
> the boundary of the current contract, and `docs/REQUESTS.md` is every request
> the owner has made with its status.

## Quickstart

```bash
git clone <repo> && cd hrajfotbalek
npm install
npx supabase start          # the local Postgres/auth/storage stack
cp .env.example .env.test.local   # then paste the URL and keys supabase printed
npm run seed                # a tableau of venues, games, players and bookings
npm run dev                 # http://localhost:3000
```

**`.env.local` points at PRODUCTION.** Six things in this repo read it and each
is a way to touch the live database by accident; `lib/env/testDatabase.ts`
refuses a non-local host for five of them, and `scripts/apply-migration.mjs`
requires an explicit `--production`. Before running anything that writes, check
which database it resolves. `CLAUDE.md` has the full account, including the day
this went wrong.

## Prerequisites

- Node 20+ and npm
- Docker, for the local Supabase stack (`npx supabase start`)
- A Supabase project and a Stripe account for anything beyond local work

## Configuration

Local development and the E2E suite read `.env.test.local`; the deployed app
reads Vercel's environment. The variables that must be set:

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Also derives the image optimizer's allow-list — see `next.config.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Never `NEXT_PUBLIC_`; the client factory throws if it is |
| `SUPABASE_DB_URL` | Direct Postgres connection, for migrations, the SQL suites and the seed |
| `NEXT_PUBLIC_SITE_URL` | Must match Supabase's redirect allow-list **exactly** — a mismatch fails silently, see `CLAUDE.md` |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Card payments |
| `RESEND_API_KEY`, `EMAIL_DRY_RUN` | Mail. The E2E suite forces dry-run on |

## Common commands

```bash
npm run dev               # local dev server
npm run build             # production build
npm run seed              # reset the local tableau (re-run when admin.spec.ts starts failing)

npm run test:unit         # pure functions; no credentials, no network
node supabase/tests/run.mjs   # SQL suites: RLS, constraints, RPC authorization
npm run test:e2e          # Playwright against the local stack, EMAIL_DRY_RUN forced
npm run test:integration  # scripts/*.check.ts against the live database

npm run perf:prod         # measure the DEPLOYED site — see perf/README.md
```

`npm run perf:prod` is not one of the four suites and asserts nothing. It prints
the function region, TTFB per journey, image bytes as a real browser downloads
them, tap-to-first-paint and whether prefetch is on. Several of those numbers do
not exist locally: there is no transatlantic hop, `next dev` disables prefetch,
and the image optimizer is off outside production.

Migrations are applied by the owner, by hand:

```bash
node scripts/apply-migration.mjs supabase/migrations/<file>.sql --production
```

## Architecture

**Every state transition is a `SECURITY DEFINER` plpgsql RPC** with
`search_path = ''`. There are zero direct client writes to any state-bearing
table, and authorization lives inside the function rather than in the route that
calls it — a route guard is skipped by anyone using curl. `service_role`
deliberately has no `UPDATE` on `bookings`.

**Features gate on capability flags, not on deploy order.** `app_capabilities()`
is created by the migration it describes, so its absence is the signal: until
the owner applies a migration, every flag is false and the controls do not
render. There is no state where a control exists and its function does not.
Reads of it are cached for at most sixty seconds and busted on every deploy, so
applying a migration still lights the feature up promptly (`lib/db/stableRead.ts`).

**Copy lives in `lib/strings.ts`;** no user-visible string appears in a
component. Czech, Russian and Ukrainian are partial overlays merged onto the
English table, so a missing translation renders English rather than a blank.
Money is Czech in every language — the player is about to open a Czech banking
app and the words have to match it.

**Colour, type and spacing come from `tailwind.config.ts`.** No inline hex in
`app/` or `components/`; the OG card and the PWA icons read the token table at
build time.

**Policy windows are values in `lib/policy.ts`, never branches.** The refund
cutoff the UI promises is read from the database function that enforces it, so
the screen cannot promise a refund the database will not pay.

**The functions run in `dub1`** (Dublin), beside the Supabase project in
`eu-west-1`. That is one line in `vercel.json` and it was worth more than every
other change in round 37 combined.

## Contributing

`CLAUDE.md` first. Then: a migration asserts shape and never writes a row,
behavioural drills live in `supabase/tests/`, no spec writes an image into a
tracked directory, and every round updates `docs/REQUESTS.md`.

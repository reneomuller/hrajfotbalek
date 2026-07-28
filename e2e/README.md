# E2E suite — Phases 28–29

28 Playwright specs against the real stack: real RPCs, real RLS, the seeded
database, and `EMAIL_DRY_RUN` forced on for the suite's own server.

| File | Covers | Specs |
|------|--------|-------|
| `booking.spec.ts` | book → QR, credit auto-apply, cash, confirmation screen | 4 |
| `waitlist.spec.ts` | join, position, spot-open conversion, the untouched loop | 4 |
| `admin.spec.ts` | games CRUD, VS-sorted confirm, shadow player, attendance → settle | 6 |
| `data.spec.ts` | event rows per action, RLS isolation, roster/waitlist projection | 10 |
| `concurrency.spec.ts` | last-spot race, one wallet across two games, ledger never negative | 4 |

## The suite depends on the seed, and that is not incidental

Sessions are minted with `signInWithPassword` against the seeded auth users in
`scripts/fixtures.ts`, then encoded into cookies by `@supabase/ssr` itself. The
magic link is bypassed **by design** — it is the one flow that cannot be driven
headlessly without turning the suite into a mail client, and driving it badly
would prove less than skipping it honestly.

Two consequences follow, and both are properties rather than bugs:

**One session per player per run, cached.** Un-cached, the suite exhausts
Supabase's sign-in rate limit partway through and every remaining spec fails
with "Request rate limit reached" — which reads exactly like a broken product.

**The suite cannot run against a purged production database.** The launch
sequence (`LAUNCH.md` step 1) deletes the seeded auth users, because they share
a password committed to this repository and one of them is an admin. Once
`npm run reset:platform -- --purge-fixtures --confirm` has run, `npm run
test:e2e` against that database fails at sign-in, and the fix is *not* to
re-create the accounts there. Point the suite at a database you have seeded
(`npm run seed`) — that is what the seed is for.

If sign-in is failing and you have not purged anything, check the rate limit
before you check the credentials.

## Scratch data

Specs build a disposable game and tear it down; they never mutate the seed
tableau, because a suite that depends on how often it has been run fails in ways
that cannot be reproduced. The one exception is the venue **E2E Scratch Pitch**,
which `helpers/scaffold.ts` creates on demand and leaves behind — venues have no
delete path in the app. It is harmless in development and belongs nowhere near
production; `LAUNCH.md` step 2 says to remove it by hand.

## Running

```sh
npm run test:e2e            # all 28
npm run test:e2e:ui         # headed, with the trace viewer
npm run test:e2e:booking    # one file
```

The config starts its own dev server with `EMAIL_DRY_RUN=on` forced, so a run
can never send mail regardless of what `.env.local` says.

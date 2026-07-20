# SQL assertion suite — Phases 3–8

Plain-SQL assertion scripts covering the schema, RLS, RPC and auth invariants.

| File | Covers | Assertions |
|------|--------|-----------|
| `01_rls_players_games_events.sql` | players/games/events RLS, cross-user reads, column-scoped UPDATE | 14 |
| `02_rls_bookings_ledger_waitlist.sql` | own-row reads, no client writes, append-only ledger | 13 |
| `03_constraints_and_vs_sequence.sql` | nickname CHECK, partial unique, waitlist unique, VS format, indexes | 20 |
| `04_game_roster_public.sql` | view projection, game-status filter, booking-status filter | 10 |
| `booking_create.sql` | create_booking + admin_create_booking: derivation, capacity, credit, authz | 36 |
| `booking_cancel.sql` | cancel_booking: ownership, window, credit-for-applied-money, events | 22 |
| `booking_rpcs_b.sql` | confirm/expire, the 3 reconciliation paths, game transitions, cancel_game | 48 |
| `auth_rpcs.sql` | shadow claim (exact match), signup validation, auth funnel events | 35 |
| `concurrency/booking_race.mjs` | genuine 2-connection races: last spot, one wallet across two games | 10 |

Total: 198 SQL assertions + 10 concurrency assertions.

## Running

Each file is standalone and wraps itself in `begin; … rollback;`, so it creates
its own fixtures and leaves no rows behind. Safe to run against the live
database.

```sh
psql "$SUPABASE_DB_URL" -f supabase/tests/01_rls_players_games_events.sql
```

Each run prints a per-assertion `PASS`/`FAIL` table and a summary row reading
`ALL PASS` or `HAS FAILURES`. Nothing raises on failure — read the summary, or
grep for `FAIL`.

## Two caveats

**The VS assertions are the one thing that is not rolled back.** Sequences are
non-transactional by design, so `03_…` permanently consumes two variable
symbols per run. That is harmless (gaps are allowed, and the sequence is 8
digits) but it is a real side effect, and it is the property that makes a VS
safe to hand to a bank in the first place.

**These are not pgTAP tests.** The plan's `TEST-003`…`TEST-007` criteria are
worded as `supabase test db`, which needs the pgTAP extension plus a local
stack under Docker. `pgtap` is available on the instance (1.3.3) but not
installed, and Docker is not present on the current dev machine. These scripts
assert the same invariants through plain SQL so they run anywhere `psql` does.
Converting them to pgTAP once a local stack exists is a mechanical change.

## Test isolation — two rules learned the hard way

These suites run against a database that also holds seed fixtures, so they must
not assume they are alone in it. Both rules below were added after real
failures that appeared the moment `npm run seed` existed:

1. **Never assert a global `count(*)`.** Scope every count to the file's own
   fixture ids. `(select count(*) from public.games) = 4` passed happily
   against an empty database and broke immediately against a seeded one — and
   it was never really asserting what it claimed to.
2. **Namespace fixture nicknames.** `players.nickname` is globally unique, so a
   test fixture called `SeedBot` collides with the seed's `SeedBot` and the
   whole file aborts on a unique violation. Test nicknames are prefixed `Tst`.

A third, subtler one, in `auth_rpcs.sql`: `reset role` does **not** clear
`request.jwt.claims`. They are separate GUCs, so an assertion meaning "nobody is
signed in" silently keeps running as whoever `act_as()` last impersonated. Use
`act_as_nobody()`.

## Assertion style

Two helpers are defined per file:

- `pg_temp.ok(cond, label, detail)` — records a result. `SECURITY DEFINER`,
  because the assertions themselves run as `anon`/`authenticated`, which own
  nothing and cannot write the results table.
- `pg_temp.probe(sql)` — runs `sql` as the *current* role and returns
  `rows:N`, `denied`, or `error:<sqlstate>` without aborting the transaction.

The `denied` vs `rows:0` distinction is deliberate and load-bearing. `denied`
means the role has no GRANT (Postgres raises `insufficient_privilege`);
`rows:0` means the role may read the table but RLS matched nothing. Both are
secure, but they are different mechanisms — a test that accepted either would
still pass if someone added a GRANT by accident. Every assertion names which
one it expects.

# SQL assertion suite — Phases 3 & 4

Plain-SQL assertion scripts covering the schema, RLS and constraint invariants
of migrations `20260720100000`, `20260720100100` and `20260720100200`.

| File | Covers | Assertions |
|------|--------|-----------|
| `01_rls_players_games_events.sql` | players/games/events RLS, cross-user reads, column-scoped UPDATE | 13 |
| `02_rls_bookings_ledger_waitlist.sql` | own-row reads, no client writes, append-only ledger | 13 |
| `03_constraints_and_vs_sequence.sql` | nickname CHECK, partial unique, waitlist unique, VS format, indexes | 20 |
| `04_game_roster_public.sql` | view projection, game-status filter, booking-status filter | 10 |

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

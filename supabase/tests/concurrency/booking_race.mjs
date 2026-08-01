// =============================================================================
// Phase 5 concurrency assertions — create_booking under genuine contention
//
// Run:  node supabase/tests/concurrency/booking_race.mjs
//       (reads SUPABASE_DB_URL from .env.test.local; never prints it)
//
// Why this is not a .sql file: the two races that matter cannot be expressed
// from one session. A session cannot block against itself, and
// pg_advisory_xact_lock taken twice inside one transaction is re-entrant — it
// succeeds immediately. Asserting "the lock works" from a single connection
// would therefore pass no matter what the lock did. These tests open real
// concurrent connections and fire the calls simultaneously.
//
// Assertions are on DATABASE STATE after the dust settles, never on timing or
// on which connection happened to win.
//
// This test COMMITS (concurrency is invisible inside one uncommitted
// transaction), so it cleans up after itself in a finally block. Every fixture
// id is a fixed, recognisable UUID so teardown is exact rather than heuristic.
// =============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));

/*
 * `.env.test.local` FIRST, and a guard behind it.
 *
 * THIS FILE USED TO READ `.env.local` BY LITERAL FILENAME, which holds
 * PRODUCTION credentials — and unlike every other suite in this repo, this
 * harness COMMITS, because concurrency is invisible inside one uncommitted
 * transaction. So running it did exactly what Phase 0 spent a session making
 * impossible everywhere else: created and deleted rows in the live database.
 *
 * Phase 0 fixed `playwright.config.ts`, `run.mjs`, `seed.ts` and the
 * integration config. It missed this one, because it is the only test here
 * that is neither a Playwright spec nor a `.sql` suite. Found in Phase 20a,
 * when the pass work needed to run it.
 *
 * The guard is not a comment: a non-local host stops the process before a
 * single connection is opened.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal']);

function readEnv(candidate) {
  try {
    const raw = readFileSync(path.resolve(here, '../../..', candidate), 'utf8');
    const env = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
    return env;
  } catch {
    return null;
  }
}

function isLocal(url) {
  // A URL that will not parse is NOT local. That direction matters: the
  // failure mode of "unparseable, so probably fine" is a committing test
  // against production.
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

const env = readEnv('.env.test.local') ?? readEnv('.env.local') ?? {};
const URL_ = env.SUPABASE_DB_URL;
if (!URL_) {
  console.error('SUPABASE_DB_URL missing from .env.test.local or .env.local');
  process.exit(2);
}

if (!isLocal(URL_)) {
  console.error(
    'booking_race.mjs refuses to run against a non-local database.\n\n' +
    'This harness COMMITS — concurrency is invisible inside one uncommitted\n' +
    'transaction — so it creates and deletes real rows. Only a local Supabase\n' +
    'stack is allowed.\n\n' +
    'Fix: `npx supabase start`, then put the printed DB URL in .env.test.local.',
  );
  process.exit(2);
}

const secrets = [URL_];
try {
  const pw = decodeURIComponent(new URL(URL_).password || '');
  if (pw) secrets.push(pw, encodeURIComponent(pw));
} catch { /* whole-string redaction still applies */ }
const scrub = (s) => secrets.reduce((acc, sec) => (sec ? acc.split(sec).join('«REDACTED»') : acc), String(s));

// The local stack speaks plain TCP; a hosted project requires TLS. Asking for
// SSL unconditionally — which this did while it was pointed at production —
// makes the local connection fail outright with "the server does not support
// SSL connections", which is a confusing way to learn the URL changed.
const NEEDS_SSL = !isLocal(URL_);

const connect = async () => {
  const c = new pg.Client({
    connectionString: URL_,
    ssl: NEEDS_SSL ? { rejectUnauthorized: false } : undefined,
  });
  await c.connect();
  return c;
};

// --- fixture ids -------------------------------------------------------------
const U = {
  raceA: 'ff000000-0000-0000-0000-0000000000a1',
  raceB: 'ff000000-0000-0000-0000-0000000000b1',
  credA: 'ff000000-0000-0000-0000-0000000000c1',
};
const P = {
  raceA: 'ffaa0000-0000-0000-0000-00000000000a',
  raceB: 'ffbb0000-0000-0000-0000-00000000000b',
  credA: 'ffcc0000-0000-0000-0000-00000000000c',
};
const G = {
  lastSpot: 'ff110000-0000-0000-0000-000000000001',
  credOne:  'ff220000-0000-0000-0000-000000000002',
  credTwo:  'ff330000-0000-0000-0000-000000000003',
  // Phase 20a. The same two races again, on a wallet made of expiring
  // batches — the shape that did not exist when these were first proved.
  passSpot: 'ff440000-0000-0000-0000-000000000004',
  passOne:  'ff550000-0000-0000-0000-000000000005',
  passTwo:  'ff660000-0000-0000-0000-000000000006',
};

const results = [];
const ok = (cond, label, detail = '') => results.push({ label, passed: !!cond, detail });

// Runs create_booking on its own connection, as the given auth user.
async function bookAs(client, authUid, gameId, method) {
  await client.query('set role authenticated');
  await client.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: authUid, role: 'authenticated' })]);
  try {
    // `with ... as materialized` is load-bearing. The obvious form,
    // `select (public.create_booking($1,$2)).*`, expands the composite into one
    // function call PER OUTPUT COLUMN — seven calls, of which the second
    // already trips DUPLICATE_ACTIVE_BOOKING against the row the first wrote.
    // Materializing pins it to exactly one invocation.
    const r = await client.query(
      `with res as materialized (select public.create_booking($1, $2) as b)
       select (b).* from res`, [gameId, method]);
    return { won: true, row: r.rows[0] };
  } catch (e) {
    return { won: false, message: e.message };
  }
}

const admin = await connect();

async function teardown() {
  await admin.query('reset role');
  const ids = [...Object.values(P)];
  const gids = [...Object.values(G)];
  await admin.query('delete from public.events where player_id = any($1) or game_id = any($2)', [ids, gids]);
  await admin.query('delete from public.credit_ledger where player_id = any($1)', [ids]);
  await admin.query('delete from public.waitlist where player_id = any($1)', [ids]);
  await admin.query('delete from public.bookings where player_id = any($1) or game_id = any($2)', [ids, gids]);
  await admin.query('delete from public.games where id = any($1)', [gids]);
  await admin.query('delete from public.players where id = any($1)', [ids]);
  await admin.query('delete from auth.users where id = any($1)', [Object.values(U)]);
}

try {
  await teardown(); // in case a previous run died mid-way

  // --- fixtures ---------------------------------------------------------------
  await admin.query(`insert into auth.users (id, email) values
    ($1,'race-a@test.invalid'), ($2,'race-b@test.invalid'), ($3,'cred-a@test.invalid')`,
    [U.raceA, U.raceB, U.credA]);

  await admin.query(`insert into public.players (id, nickname, email, auth_user_id) values
    ($1,'RaceA','race-a@test.invalid',$4),
    ($2,'RaceB','race-b@test.invalid',$5),
    ($3,'CredA','cred-a@test.invalid',$6)`,
    [P.raceA, P.raceB, P.credA, U.raceA, U.raceB, U.credA]);

  await admin.query(`insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
    ($1,'Last Spot', now() + interval '7 days', 1, 200, 'published'),
    ($2,'Credit One', now() + interval '8 days', 10, 200, 'published'),
    ($3,'Credit Two', now() + interval '9 days', 10, 200, 'published'),
    ($4,'Pass Spot', now() + interval '10 days', 1, 200, 'published'),
    ($5,'Pass One', now() + interval '11 days', 10, 200, 'published'),
    ($6,'Pass Two', now() + interval '12 days', 10, 200, 'published')`,
    [G.lastSpot, G.credOne, G.credTwo, G.passSpot, G.passOne, G.passTwo]);

  // ===========================================================================
  // RACE 1 — two players, one remaining spot, fired simultaneously
  // ===========================================================================
  {
    const [c1, c2] = [await connect(), await connect()];
    try {
      const [r1, r2] = await Promise.all([
        bookAs(c1, U.raceA, G.lastSpot, 'cash'),
        bookAs(c2, U.raceB, G.lastSpot, 'cash'),
      ]);

      const winners = [r1, r2].filter((r) => r.won).length;
      ok(winners === 1, 'exactly one of two simultaneous last-spot bookings succeeds',
        `winners=${winners}`);

      const loser = [r1, r2].find((r) => !r.won);
      ok(loser && /CAPACITY_FULL/.test(loser.message || ''),
        'the loser is rejected with CAPACITY_FULL (not a raw constraint error)',
        loser ? loser.message : 'no loser');

      const { rows } = await admin.query(
        `select count(*)::int n from public.bookings
          where game_id = $1 and status in ('reserved','confirmed')`, [G.lastSpot]);
      ok(rows[0].n === 1, 'the database holds exactly one active booking for the 1-spot game',
        `active=${rows[0].n}`);

      const g = await admin.query('select status from public.games where id = $1', [G.lastSpot]);
      ok(g.rows[0].status === 'full', 'the game is flipped to full after the race',
        `status=${g.rows[0].status}`);
    } finally {
      await c1.end().catch(() => {});
      await c2.end().catch(() => {});
    }
  }

  // ===========================================================================
  // RACE 2 — ONE player, TWO different games, ONE balance, fired simultaneously
  //
  // This is the race the game lock cannot catch: the two calls touch different
  // games, so they never contend on a game lock. Only the per-player lock and
  // the balance re-read under it stop the same 200 CZK being spent twice.
  // ===========================================================================
  {
    await admin.query(
      `insert into public.credit_ledger (player_id, delta_czk, reason) values ($1, 200, 'admin_grant')`,
      [P.credA]);

    const [c1, c2] = [await connect(), await connect()];
    try {
      const [r1, r2] = await Promise.all([
        bookAs(c1, U.credA, G.credOne, 'qr'),
        bookAs(c2, U.credA, G.credTwo, 'qr'),
      ]);

      ok(r1.won && r2.won, 'both bookings succeed (different games, capacity available)',
        `r1=${r1.won} r2=${r2.won}`);

      const bal = await admin.query(
        'select coalesce(sum(delta_czk),0)::int b from public.credit_ledger where player_id = $1',
        [P.credA]);
      ok(bal.rows[0].b === 0, 'the wallet lands at exactly 0 — the 200 was spent once, not twice',
        `balance=${bal.rows[0].b}`);
      ok(bal.rows[0].b >= 0, 'SUM(delta_czk) never goes below zero', `balance=${bal.rows[0].b}`);

      const applied = await admin.query(
        `select coalesce(sum(credit_applied_czk),0)::int a from public.bookings
          where player_id = $1 and status in ('reserved','confirmed')`, [P.credA]);
      ok(applied.rows[0].a === 200, 'exactly 200 CZK of credit is applied across both bookings',
        `applied=${applied.rows[0].a}`);

      const methods = await admin.query(
        `select payment_method::text m, credit_applied_czk c from public.bookings
          where player_id = $1 order by credit_applied_czk desc`, [P.credA]);
      const shape = methods.rows.map((r) => `${r.m}:${r.c}`).join(' ');
      ok(methods.rows.length === 2 &&
         methods.rows[0].c === 200 && methods.rows[0].m === 'credit' &&
         methods.rows[1].c === 0   && methods.rows[1].m === 'qr',
        'one booking is fully credit-covered; the other applies 0 and falls back to qr', shape);

      const redemptions = await admin.query(
        `select count(*)::int n from public.credit_ledger
          where player_id = $1 and reason = 'redemption'`, [P.credA]);
      ok(redemptions.rows[0].n === 1, 'exactly one redemption row is written, not two',
        `redemptions=${redemptions.rows[0].n}`);
    } finally {
      await c1.end().catch(() => {});
      await c2.end().catch(() => {});
    }
  }

  // ===========================================================================
  // RACE 3 (Phase 20a) — the last spot, with BOTH players holding pass credit
  //
  // Capacity is still the sole booking limit. A wallet full of pass credit
  // does not conjure a spot, and the loser is refused with CAPACITY_FULL
  // rather than with anything about money — which is what stops a player
  // concluding their pass was the problem.
  // ===========================================================================
  {
    await admin.query(
      `insert into public.credit_ledger (player_id, delta_czk, reason, expires_at)
       values ($1, 1000, 'topup', now() + interval '30 days'),
              ($2, 1000, 'topup', now() + interval '30 days')`,
      [P.raceA, P.raceB]);

    const [c1, c2] = [await connect(), await connect()];
    try {
      const [r1, r2] = await Promise.all([
        bookAs(c1, U.raceA, G.passSpot, 'cash'),
        bookAs(c2, U.raceB, G.passSpot, 'cash'),
      ]);

      const winners = [r1, r2].filter((r) => r.won).length;
      ok(winners === 1, 'batch wallets: exactly one of two simultaneous last-spot bookings succeeds',
        `winners=${winners}`);

      const loser = [r1, r2].find((r) => !r.won);
      ok(loser && /CAPACITY_FULL/.test(loser.message || ''),
        'batch wallets: the loser is refused on CAPACITY, not on anything about money',
        loser ? loser.message : 'no loser');

      // The refused booking must have spent nothing. A partial allocation
      // surviving a rolled-back booking would be money taken for a spot the
      // player never got.
      const spent = await admin.query(
        `select coalesce(sum(delta_czk),0)::int n from public.credit_ledger
          where player_id = any($1) and reason = 'redemption'`, [[P.raceA, P.raceB]]);
      ok(spent.rows[0].n === -200,
        'exactly one game was paid for out of the two batches, not two',
        `redeemed=${spent.rows[0].n}`);

      const balances = await admin.query(
        `select player_id, coalesce(sum(delta_czk),0)::int n from public.credit_ledger
          where player_id = any($1) group by player_id order by player_id`, [[P.raceA, P.raceB]]);
      ok(balances.rows.every((r) => r.n >= 0),
        'neither wallet went negative',
        balances.rows.map((r) => r.n).join(','));
    } finally {
      await c1.end().catch(() => {});
      await c2.end().catch(() => {});
    }
  }

  // ===========================================================================
  // RACE 4 (Phase 20a) — ONE player, TWO games, ONE BATCH, fired simultaneously
  //
  // THE DOUBLE-SPEND RACE, RE-PROVED THROUGH THE ALLOCATOR. This is the race
  // the game lock cannot catch — two different games, so no game-lock
  // contention — and it is now running against a wallet where the spend is
  // written as one negative row PER BATCH rather than as a single row. If the
  // allocator read batch remainders outside the player lock, both calls would
  // see the same full batch and both would spend it.
  // ===========================================================================
  {
    await admin.query(
      `insert into public.credit_ledger (player_id, delta_czk, reason, expires_at)
       values ($1, 200, 'topup', now() + interval '30 days')`,
      [P.credA]);

    const [c1, c2] = [await connect(), await connect()];
    try {
      const [r1, r2] = await Promise.all([
        bookAs(c1, U.credA, G.passOne, 'qr'),
        bookAs(c2, U.credA, G.passTwo, 'qr'),
      ]);

      ok(r1.won && r2.won, 'both bookings succeed (different games, capacity available)',
        `r1=${r1.won} r2=${r2.won}`);

      const bal = await admin.query(
        `select coalesce(sum(delta_czk),0)::int n from public.credit_ledger where player_id = $1`,
        [P.credA]);
      ok(bal.rows[0].n === 0, 'the batch was spent once, not twice', `balance=${bal.rows[0].n}`);
      ok(bal.rows[0].n >= 0, 'SUM(delta_czk) never goes below zero, batches included',
        `balance=${bal.rows[0].n}`);

      // And no BATCH went below zero either — the invariant the flat ledger
      // never had, checked here under real contention.
      const worst = await admin.query(
        `select min(remaining)::int n from (
           select (b.delta_czk + coalesce((
             select sum(m.delta_czk) from public.credit_ledger m where m.batch_id = b.id
           ),0)) as remaining
           from public.credit_ledger b
           where b.player_id = $1 and b.expires_at is not null
         ) s`, [P.credA]);
      ok(worst.rows[0].n >= 0, 'no batch remainder went negative under contention',
        `min_remaining=${worst.rows[0].n}`);

      const applied = await admin.query(
        `select coalesce(sum(credit_applied_czk),0)::int n from public.bookings
          where player_id = $1 and game_id = any($2)`, [P.credA, [G.passOne, G.passTwo]]);
      ok(applied.rows[0].n === 200, 'exactly 200 CZK of batch credit is applied across both bookings',
        `applied=${applied.rows[0].n}`);
    } finally {
      await c1.end().catch(() => {});
      await c2.end().catch(() => {});
    }
  }

  // --- report -----------------------------------------------------------------
  const failed = results.filter((r) => !r.passed);
  console.log('');
  for (const [i, r] of results.entries()) {
    console.log(`  ${String(i + 1).padStart(2)}. [${r.passed ? 'PASS' : 'FAIL'}] ${r.label}${r.detail ? `  (${r.detail})` : ''}`);
  }
  console.log('');
  console.log(`  total=${results.length} passed=${results.length - failed.length} failed=${failed.length} ` +
              `-> ${failed.length === 0 ? 'ALL PASS' : 'HAS FAILURES'}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (e) {
  console.error('HARNESS ERROR:', scrub(e.message));
  process.exitCode = 2;
} finally {
  await teardown().catch((e) => console.error('teardown failed:', scrub(e.message)));
  await admin.end().catch(() => {});
}

// =============================================================================
// Phase 5 concurrency assertions — create_booking under genuine contention
//
// Run:  node supabase/tests/concurrency/booking_race.mjs
//       (reads SUPABASE_DB_URL from .env.local; never prints it)
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
const envPath = path.resolve(here, '../../../.env.local');

const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}
const URL_ = env.SUPABASE_DB_URL;
if (!URL_) { console.error('SUPABASE_DB_URL missing'); process.exit(2); }

const secrets = [URL_];
try {
  const pw = decodeURIComponent(new URL(URL_).password || '');
  if (pw) secrets.push(pw, encodeURIComponent(pw));
} catch { /* whole-string redaction still applies */ }
const scrub = (s) => secrets.reduce((acc, sec) => (sec ? acc.split(sec).join('«REDACTED»') : acc), String(s));

const connect = async () => {
  const c = new pg.Client({ connectionString: URL_, ssl: { rejectUnauthorized: false } });
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
    ($3,'Credit Two', now() + interval '9 days', 10, 200, 'published')`,
    [G.lastSpot, G.credOne, G.credTwo]);

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

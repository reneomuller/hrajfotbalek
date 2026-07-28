// =============================================================================
// PRE-LAUNCH PLATFORM RESET — clears the pitch, keeps the people.
//
//   node --env-file=.env.local scripts/reset-platform.mjs             (dry run)
//   node --env-file=.env.local scripts/reset-platform.mjs --confirm   (deletes)
//
//   ... --purge-fixtures            (dry run, also lists the fixture purge)
//   ... --purge-fixtures --confirm  (also removes the fixture accounts)
//
// Deletes every game, booking, waitlist row, credit-ledger entry and event.
// PRESERVES every player, including their `is_admin` flag, their auth user and
// the venues.
//
// WITH `--purge-fixtures` it additionally removes the accounts and venues that
// only ever existed to make tests run — see the fixture-purge section below for
// what qualifies and why the default is to keep them.
//
// WHY THIS EXISTS. Between now and launch the database accumulates test games,
// fixture bookings, credit minted by overpaying a fake booking, and a few
// thousand events from repeated seeding. None of it is real, all of it would
// show up in `/admin/stats` on day one, and the credit rows in particular are
// liabilities the product would honour — a fixture wallet balance is money the
// platform owes someone for a game that never happened.
//
// WHY IT KEEPS PLAYERS. The people are real even when their bookings are not:
// they have signed in, chosen nicknames, and the admin flags were granted by
// hand. Wiping them would mean re-granting admin rights and asking everyone to
// sign up again, which is a worse day-one than a few stale rows.
//
// THIS IS NOT THE SEED RESET. `npm run seed:reset` is id-scoped: it removes the
// fixture rows and leaves anything real alone. This is the opposite — it removes
// everything transactional regardless of where it came from, which is what
// "start the season with a clean board" means. Use the seed reset while
// developing; use this one once, the night before launch.
//
// SAFETY. It refuses to do anything without `--confirm`; without it, it counts
// what it would delete and stops. It re-counts players and admins afterwards
// and fails loudly if either moved, because "preserves players" is the one
// promise here that cannot be walked back.
// =============================================================================
import { createClient } from '@supabase/supabase-js';

// -----------------------------------------------------------------------------
// client
//
// Built here rather than imported from lib/supabase/clients.ts for the same
// reason scripts/seed.ts builds its own: that module imports `next/headers`,
// which is not resolvable outside a Next request context. The service-role
// guards are reproduced rather than skipped.
// -----------------------------------------------------------------------------

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    console.error('Run with:  node --env-file=.env.local scripts/reset-platform.mjs');
    process.exit(2);
  }
  return value;
}

const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY is set. The service-role key bypasses ' +
      'RLS and must never carry a NEXT_PUBLIC_ prefix — that inlines it into the ' +
      'client bundle. Rename it and try again.',
  );
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// -----------------------------------------------------------------------------
// what goes, and in what order
//
// Reverse dependency order. It cannot lean on cascades: events.player_id,
// game_id and booking_id are all ON DELETE SET NULL, so deleting games first
// would leave orphaned event rows behind rather than removing them.
// -----------------------------------------------------------------------------

const WIPE = [
  { table: 'events', why: 'the whole event log — every stat is a query over this' },
  { table: 'credit_ledger', why: 'fixture wallet balances are liabilities that would be honoured' },
  { table: 'waitlist', why: 'queues for games that will not be played' },
  { table: 'bookings', why: 'test reservations, payments and no-shows' },
  { table: 'games', why: 'every game, played or upcoming' },
];

/** Tables that must come out of this unchanged unless a purge is requested. */
const PRESERVE = ['players', 'venues'];

// -----------------------------------------------------------------------------
// the fixture purge (--purge-fixtures)
//
// The reset above keeps every player because the people are real. That reasoning
// does not extend to accounts which were never people:
//
//   1. THE SEEDED AUTH USERS. `scripts/fixtures.ts` creates five auth users with
//      a SHARED PASSWORD THAT IS COMMITTED TO THIS REPOSITORY (SEED_PASSWORD),
//      because the E2E suite signs in as them. One of them — Organizer — carries
//      `is_admin`. Surviving the reset, that is a published-password admin login
//      against production. This is the leg of the purge that is not cosmetic.
//   2. THE MANUAL TEST SHADOWS. Nicknames typed into the admin panel while
//      exercising the add-player flow. Harmless, but they are the first thing an
//      organizer sees in the player list on day one.
//   3. THE JUNK VENUES. The XSS-probe venue, the gate rehearsals and a duplicate
//      draft. Venues survive the reset by design, so these reach the venue picker
//      unless they are named here.
//
// WHY THIS IS A FLAG AND NOT THE DEFAULT. Deleting an auth user is the one action
// in this script that cannot be undone by re-running a seed: the E2E suite cannot
// sign in afterwards (see e2e/README.md). Development databases want the reset
// without the purge; production wants it exactly once.
//
// SCOPE IS BY VALUE, NOT BY GUESS. Each group is an explicit list or an exact
// match on the fixture email domain. Nothing is deleted because it "looks like" a
// fixture — a real player who happens to have picked a short nickname is not
// collateral. Every guard that refuses a deletion is reported rather than
// silently skipped.
// -----------------------------------------------------------------------------

/** Fixture auth users all live on this domain. Exact suffix match, never a LIKE. */
const FIXTURE_EMAIL_DOMAIN = '@seed.hrajfotbal.test';

/**
 * Shadow players created by hand while testing the admin add-player flow.
 * Purged only when they are still shadows (no auth user) and not admins — a
 * nickname collision with a real signup must never take the real account.
 */
const MANUAL_TEST_NICKNAMES = ['UIa2607', 'Jachym', 'B', 'Bbab', 'Jsjejbebe'];

/** Venues that exist only as test scaffolding. Exact names, from the live table. */
const JUNK_VENUE_NAMES = [
  '<script>alert(1)</script> "Praha 2", a;b\\c',
  'Gate Test M3',
  'Test hřiště',
  'Praha 3 — Pražačka (draft)',
];

async function loadPlayers() {
  const { data, error } = await admin
    .from('players')
    .select('id, nickname, email, is_admin, auth_user_id');
  if (error) throw new Error(`read players: ${error.message}`);
  return data ?? [];
}

async function loadVenues() {
  const { data, error } = await admin.from('venues').select('id, name');
  if (error) throw new Error(`read venues: ${error.message}`);
  return data ?? [];
}

/**
 * Decides what the purge would remove, without removing anything.
 *
 * Returns the two player groups, the venue group, and — just as important — the
 * `refused` list: rows that matched a name but failed a guard. Those are printed
 * so the human sees them, because a silent skip on a destructive script reads as
 * "there was nothing to do".
 */
function planPurge(players, venues) {
  const seedAccounts = players.filter((p) => p.email?.endsWith(FIXTURE_EMAIL_DOMAIN));

  const manualShadows = [];
  const refused = [];
  for (const nickname of MANUAL_TEST_NICKNAMES) {
    const matches = players.filter((p) => p.nickname === nickname);
    if (matches.length === 0) {
      refused.push({ what: `player "${nickname}"`, why: 'not present — already gone' });
      continue;
    }
    for (const player of matches) {
      if (player.is_admin) {
        refused.push({ what: `player "${nickname}"`, why: 'is an admin — refusing' });
      } else if (player.auth_user_id !== null) {
        refused.push({
          what: `player "${nickname}"`,
          why: 'has signed in (real account) — refusing',
        });
      } else if (player.email?.endsWith(FIXTURE_EMAIL_DOMAIN)) {
        // Already in the seed group; do not count or delete it twice.
      } else {
        manualShadows.push(player);
      }
    }
  }

  const junkVenues = [];
  for (const name of JUNK_VENUE_NAMES) {
    const match = venues.find((v) => v.name === name);
    if (match) junkVenues.push(match);
    else refused.push({ what: `venue "${name}"`, why: 'not present — already gone' });
  }

  // Fixture players that the named groups do not cover. Reported, never deleted:
  // deciding whether `oliverv2` is a person is not this script's call to make.
  const targeted = new Set([...seedAccounts, ...manualShadows].map((p) => p.id));
  const otherFixtureLooking = players.filter(
    (p) => !targeted.has(p.id) && p.id.startsWith('5eed0000-'),
  );

  return { seedAccounts, manualShadows, junkVenues, refused, otherFixtureLooking };
}

/**
 * Deletes the junk venues over a direct Postgres connection rather than through
 * the service-role client.
 *
 * NOT AN AFFECTATION. Migration 15 grants service_role SELECT on `venues` and
 * nothing else — venues are written exclusively through `admin_create_venue`, so
 * a PostgREST delete here fails on privileges. The alternatives were to widen a
 * production grant permanently for a one-time cleanup, or to add a delete-venue
 * RPC that any admin JWT could then reach. Borrowing the migration runner's
 * connection for four rows is the narrower blast radius.
 *
 * Follows scripts/apply-migration.mjs on secret handling: the connection string
 * is never printed and error text is scrubbed of it before it reaches a console.
 */
async function deleteVenues(names) {
  if (names.length === 0) return [];
  const url = process.env.SUPABASE_DB_URL;
  const { default: pg } = await import('pg');

  const secrets = [url];
  try {
    const pw = decodeURIComponent(new URL(url).password || '');
    if (pw) secrets.push(pw, encodeURIComponent(pw));
  } catch {
    /* whole-string redaction still applies */
  }
  const scrub = (s) =>
    secrets.reduce((acc, sec) => (sec ? acc.split(sec).join('«REDACTED»') : acc), String(s));

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query(
      'delete from public.venues where name = any($1::text[]) returning name',
      [names],
    );
    return rows.map((r) => r.name);
  } catch (error) {
    throw new Error(`delete venues: ${scrub(error.message)}`);
  } finally {
    await client.end();
  }
}

async function count(table) {
  const { count: n, error } = await admin.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return n ?? 0;
}

async function countAdmins() {
  const { count: n, error } = await admin
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('is_admin', true);
  if (error) throw new Error(`count admins: ${error.message}`);
  return n ?? 0;
}

/**
 * Deletes every row in a table.
 *
 * PostgREST refuses an unfiltered DELETE, which is a good default and an
 * obstacle here. `not id is null` is the filter that matches everything while
 * still being a filter — deliberate, not a trick: it is written this way so the
 * intent to delete all rows is visible in the code rather than hidden in a
 * missing clause.
 */
async function deleteAll(table) {
  const { error } = await admin.from(table).delete().not('id', 'is', null);
  if (error) throw new Error(`delete ${table}: ${error.message}`);
}

// -----------------------------------------------------------------------------
// run
// -----------------------------------------------------------------------------

const confirmed = process.argv.includes('--confirm');
const purging = process.argv.includes('--purge-fixtures');

// Checked before a single row is touched: the venue leg needs a direct
// connection, and discovering that halfway through a destructive run would
// leave the job half done with no way to finish it.
if (purging) requireEnv('SUPABASE_DB_URL');

console.log('');
console.log('  PLATFORM RESET');
console.log(`  ${SUPABASE_URL}`);
if (purging) console.log('  + FIXTURE PURGE');
console.log('');

const before = {};
for (const { table } of WIPE) before[table] = await count(table);
for (const table of PRESERVE) before[table] = await count(table);
before.admins = await countAdmins();

const playersBefore = await loadPlayers();
const venuesBefore = await loadVenues();
const plan = purging
  ? planPurge(playersBefore, venuesBefore)
  : { seedAccounts: [], manualShadows: [], junkVenues: [], refused: [], otherFixtureLooking: [] };

const purgedPlayers = [...plan.seedAccounts, ...plan.manualShadows];
const purgedPlayerIds = new Set(purgedPlayers.map((p) => p.id));
const purgedVenueIds = new Set(plan.junkVenues.map((v) => v.id));
const purgedAdmins = purgedPlayers.filter((p) => p.is_admin).length;
const purgedAuthUserIds = purgedPlayers.map((p) => p.auth_user_id).filter(Boolean);

console.log('  WILL DELETE');
for (const { table, why } of WIPE) {
  console.log(`    ${String(before[table]).padStart(6)}  ${table.padEnd(15)} ${why}`);
}
console.log('');

if (purging) {
  console.log('  WILL PURGE');
  for (const p of plan.seedAccounts) {
    const flags = [p.is_admin ? 'ADMIN' : null, p.auth_user_id ? 'auth user' : 'shadow']
      .filter(Boolean)
      .join(', ');
    console.log(`            player   ${p.nickname.padEnd(18)} ${p.email}  (${flags})`);
  }
  for (const p of plan.manualShadows) {
    console.log(`            player   ${p.nickname.padEnd(18)} manual test shadow`);
  }
  for (const v of plan.junkVenues) {
    console.log(`            venue    ${v.name}`);
  }
  if (purgedAuthUserIds.length > 0) {
    console.log(`            ${purgedAuthUserIds.length} auth users, and the shared seed password with them`);
  }
  console.log('');

  if (plan.refused.length > 0) {
    console.log('  NOT PURGED');
    for (const r of plan.refused) console.log(`            ${r.what} — ${r.why}`);
    console.log('');
  }

  if (plan.otherFixtureLooking.length > 0) {
    console.log('  LEFT ALONE — fixture-shaped, but not on any list here.');
    console.log('  Decide by hand whether these are people:');
    for (const p of plan.otherFixtureLooking) {
      console.log(`            ${p.nickname.padEnd(18)} ${p.email ?? '(no email)'}`);
    }
    console.log('');
  }
}

console.log('  WILL KEEP');
console.log(`    ${String(before.players - purgedPlayers.length).padStart(6)}  players`);
console.log(`    ${String(before.venues - plan.junkVenues.length).padStart(6)}  venues`);
console.log(`    ${String(before.admins - purgedAdmins).padStart(6)}  players with is_admin`);
console.log('');

if (!confirmed) {
  console.log('  DRY RUN — nothing was deleted.');
  console.log('  Re-run with --confirm to go ahead:');
  console.log('');
  console.log(
    `    node --env-file=.env.local scripts/reset-platform.mjs${purging ? ' --purge-fixtures' : ''} --confirm`,
  );
  console.log('');
  process.exit(0);
}

for (const { table } of WIPE) {
  await deleteAll(table);
  const remaining = await count(table);
  if (remaining !== 0) {
    console.error(`  FAILED  ${table} still has ${remaining} rows`);
    process.exit(1);
  }
  console.log(`  CLEARED ${table.padEnd(15)} ${before[table]} rows`);
}

// The purge runs after the wipe, never before: bookings, ledger rows and
// waitlist entries reference players, and by this point there are none left to
// stand in the way.
if (purging) {
  for (const authUserId of purgedAuthUserIds) {
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (error) {
      console.error(`  FAILED  delete auth user ${authUserId}: ${error.message}`);
      process.exit(1);
    }
  }
  if (purgedAuthUserIds.length > 0) {
    console.log(`  PURGED  auth users      ${purgedAuthUserIds.length}`);
  }

  if (purgedPlayerIds.size > 0) {
    const { error } = await admin.from('players').delete().in('id', [...purgedPlayerIds]);
    if (error) {
      console.error(`  FAILED  delete players: ${error.message}`);
      process.exit(1);
    }
    console.log(`  PURGED  players         ${purgedPlayerIds.size}`);
  }

  const deletedVenueNames = await deleteVenues(plan.junkVenues.map((v) => v.name));
  if (deletedVenueNames.length > 0) {
    console.log(`  PURGED  venues          ${deletedVenueNames.length}`);
  }
}

// The promises that cannot be walked back, verified rather than assumed: what
// survived is compared row by row against what was meant to survive, in both
// directions. A count alone would pass if one row vanished and another appeared.
const after = { admins: await countAdmins() };
for (const table of PRESERVE) after[table] = await count(table);
const playersAfter = await loadPlayers();
const venuesAfter = await loadVenues();

let broken = false;

const report = (message) => {
  console.error(`  ERROR   ${message}`);
  broken = true;
};

const survivorCheck = (label, beforeRows, afterRows, intended) => {
  const afterIds = new Set(afterRows.map((r) => r.id));
  for (const row of beforeRows) {
    const gone = !afterIds.has(row.id);
    const meantToGo = intended.has(row.id);
    if (gone && !meantToGo) {
      report(`${label} "${row.nickname ?? row.name}" was deleted and should not have been.`);
    }
    if (!gone && meantToGo) {
      report(`${label} "${row.nickname ?? row.name}" survived the purge.`);
    }
  }
};

survivorCheck('player', playersBefore, playersAfter, purgedPlayerIds);
survivorCheck('venue', venuesBefore, venuesAfter, purgedVenueIds);

const expected = {
  players: before.players - purgedPlayers.length,
  venues: before.venues - plan.junkVenues.length,
  admins: before.admins - purgedAdmins,
};
for (const key of ['players', 'venues', 'admins']) {
  if (after[key] !== expected[key]) {
    report(`${key}: expected ${expected[key]} after this run, found ${after[key]}.`);
  }
}

// An auth user that outlives its player row is the failure worth naming: the
// login would still work while nothing in the app knows who it belongs to.
for (const authUserId of purgedAuthUserIds) {
  const { data, error } = await admin.auth.admin.getUserById(authUserId);
  if (!error && data?.user) {
    report(`auth user ${authUserId} still exists after its player row was purged.`);
  }
}

console.log('');
if (broken) {
  console.error('  RESET COMPLETED BUT VERIFICATION FAILED — check the rows above.');
  process.exit(1);
}

console.log(`  DONE. ${after.players} players kept (${after.admins} admin), ` +
  `${after.venues} venues kept, everything else cleared.`);
if (purging) {
  console.log('');
  console.log('  The seeded logins are gone. `npm run test:e2e` cannot run against this');
  console.log('  database again without reseeding — see e2e/README.md.');
}
console.log('');
console.log('  Next: EMAIL_DRY_RUN=off, then create the first real game.');
console.log('');

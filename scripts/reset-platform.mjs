// =============================================================================
// PRE-LAUNCH PLATFORM RESET — clears the pitch, keeps the people.
//
//   node --env-file=.env.local scripts/reset-platform.mjs             (dry run)
//   node --env-file=.env.local scripts/reset-platform.mjs --confirm   (deletes)
//
// Deletes every game, booking, waitlist row, credit-ledger entry and event.
// PRESERVES every player, including their `is_admin` flag, their auth user and
// the venues.
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

/** Tables that must come out of this unchanged. */
const PRESERVE = ['players', 'venues'];

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

console.log('');
console.log('  PLATFORM RESET');
console.log(`  ${SUPABASE_URL}`);
console.log('');

const before = {};
for (const { table } of WIPE) before[table] = await count(table);
for (const table of PRESERVE) before[table] = await count(table);
before.admins = await countAdmins();

console.log('  WILL DELETE');
for (const { table, why } of WIPE) {
  console.log(`    ${String(before[table]).padStart(6)}  ${table.padEnd(15)} ${why}`);
}
console.log('');
console.log('  WILL KEEP');
for (const table of PRESERVE) {
  console.log(`    ${String(before[table]).padStart(6)}  ${table}`);
}
console.log(`    ${String(before.admins).padStart(6)}  players with is_admin`);
console.log('');

if (!confirmed) {
  console.log('  DRY RUN — nothing was deleted.');
  console.log('  Re-run with --confirm to go ahead:');
  console.log('');
  console.log('    node --env-file=.env.local scripts/reset-platform.mjs --confirm');
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

// The promise that cannot be walked back, verified rather than assumed.
const after = { admins: await countAdmins() };
for (const table of PRESERVE) after[table] = await count(table);

let broken = false;
for (const table of [...PRESERVE, 'admins']) {
  if (after[table] !== before[table]) {
    console.error(
      `  ERROR   ${table} changed: ${before[table]} -> ${after[table]}. ` +
        'This script must never touch these.',
    );
    broken = true;
  }
}

console.log('');
if (broken) {
  console.error('  RESET COMPLETED BUT PRESERVATION FAILED — check the rows above.');
  process.exit(1);
}

console.log(`  DONE. ${after.players} players kept (${after.admins} admin), ` +
  `${after.venues} venues kept, everything else cleared.`);
console.log('');
console.log('  Next: EMAIL_DRY_RUN=off, then create the first real game.');
console.log('');

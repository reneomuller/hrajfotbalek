// =============================================================================
// Apply one or more migration files to the database in SUPABASE_DB_URL.
//
//   node scripts/apply-migration.mjs supabase/migrations/2026..._rpc_x.sql
//   node scripts/apply-migration.mjs --production supabase/migrations/...
//
// Exists because `psql` is not installed on every machine that needs to run
// these, while `pg` already is — same reasoning as supabase/tests/run.mjs.
//
// Each file is applied inside ONE transaction: a migration that fails halfway
// leaves nothing behind.
//
// -----------------------------------------------------------------------------
// WHY THIS SCRIPT HAS A GUARD, AND WHY IT IS THE SIXTH
//
// It reads SUPABASE_DB_URL from `.env.local`, and `.env.local` holds PRODUCTION
// credentials — that is the whole point of the file. So the innocent-looking
// act of validating a migration locally was, in fact, applying it to
// production. That happened on 2026-08-10: a migration written for the owner to
// apply was run here instead, on the reading that this script was the local
// tool. It printed `APPLIED` and named no host, so nothing in the output
// contradicted the assumption.
//
// This is the SIXTH member of the `.env.local` family — the runners that read
// the production credential file — and the last one to get a guard. The others
// are `playwright.config.ts`, `supabase/tests/run.mjs`, `scripts/seed.ts`,
// `scripts/reset-platform.mjs` and the `*.check.ts` integration suite, all of
// which route through `lib/env/testDatabase.ts`. This one could not: it is a
// plain `.mjs` with no TypeScript loader, so the host rule is restated below
// rather than imported. **The two must change together.**
//
// The rule is mechanical rather than remembered, exactly as the Phase 0 guard
// argues: a local stack runs without ceremony, anything else refuses unless the
// caller says `--production` in the same breath. And the resolved host is
// PRINTED EVERY TIME, because the failure above was not a missing check so much
// as a silent one — output that named the target would have caught it before
// the transaction committed.
// =============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

/**
 * Hosts that can only be a stack running on this machine.
 *
 * MIRRORS `LOCAL_HOSTS` in lib/env/testDatabase.ts and must change with it.
 * Restated rather than imported because this is a plain `.mjs` run by bare
 * node, with no TypeScript loader to pull the shared module through.
 */
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'host.docker.internal',
]);

/**
 * Whether a connection string points at a database on this machine.
 *
 * A MALFORMED URL IS NOT LOCAL, the same direction the Phase 0 guard takes:
 * the failure mode of "unparseable, so probably fine" is a migration against
 * production.
 */
export function isLocalDatabaseUrl(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** `host:port`, with any credentials in the URL left out of it. */
export function describeHost(url) {
  try {
    const parsed = new URL(url);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return '(unparseable connection string)';
  }
}

/** Splits `--production` out of the file list, in any position. */
export function parseArgs(argv) {
  return {
    production: argv.includes('--production'),
    files: argv.filter((arg) => arg !== '--production'),
  };
}

/**
 * Throws unless this invocation may write to `url`.
 *
 * Local runs without ceremony. Anything else demands `--production` in the
 * same command — not an environment variable, because a variable exported once
 * in a shell outlives the intention that set it, and this is the check that
 * failed by being implicit.
 */
export function assertMigrationTarget(url, { production = false } = {}) {
  if (isLocalDatabaseUrl(url)) return;
  if (production) return;

  throw new Error(
    `Refusing to apply migrations to ${describeHost(url)}.\n\n` +
      `That is not a database on this machine. SUPABASE_DB_URL is read from ` +
      `.env.local, which holds PRODUCTION credentials — so an unguarded run ` +
      `here is a schema change on the live product, which is what happened on ` +
      `2026-08-10.\n\n` +
      `To apply locally: point .env.local's SUPABASE_DB_URL at your local ` +
      `stack, or run the SQL against .env.test.local yourself.\n` +
      `To apply to production, say so: --production`,
  );
}

/*
 * The executable half, behind an entrypoint check so the helpers above can be
 * imported by a test without opening a connection or calling `process.exit`.
 * Without this the guard would be the one piece of logic in the repo that
 * could not be tested — which is the wrong place to have a gap.
 */
async function main() {
  const { production, files } = parseArgs(process.argv.slice(2));
  if (files.length === 0) {
    console.error('usage: node scripts/apply-migration.mjs [--production] <file.sql> [...]');
    process.exit(2);
  }

  const envPath = path.resolve(process.cwd(), '.env.local');
  let url = null;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)$/);
    if (m) url = m[1].trim().replace(/^["']|["']$/g, '');
  }
  if (!url) {
    console.error('SUPABASE_DB_URL not found in .env.local');
    process.exit(2);
  }

  /*
   * NAME THE TARGET, ALWAYS AND FIRST. The 2026-08-10 failure was not only a
   * missing check — it was a silent one. `APPLIED` with no host reads as success
   * against whatever the reader assumed they were pointed at.
   */
  console.log(`TARGET   ${describeHost(url)}${isLocalDatabaseUrl(url) ? '' : '  (REMOTE)'}`);

  try {
    assertMigrationTarget(url, { production });
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  if (!isLocalDatabaseUrl(url)) {
    console.log(`WARNING  --production given; applying to ${describeHost(url)}`);
  }

  /*
   * The connection string never reaches the console, and neither does its
   * password on its own — a `pg` error can quote either. Restored deliberately
   * after the guard rewrite dropped it: an error path that leaks a production
   * credential into a terminal scrollback is worse than the error.
   */
  const secrets = [url];
  try {
    const pw = decodeURIComponent(new URL(url).password || '');
    if (pw) secrets.push(pw, encodeURIComponent(pw));
  } catch {
    /* whole-string redaction still applies */
  }
  const scrub = (value) =>
    secrets.reduce(
      (acc, secret) => (secret ? acc.split(secret).join('«REDACTED»') : acc),
      String(value),
    );

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let failed = false;
  for (const file of files) {
    const sql = readFileSync(file, 'utf8');
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('commit');
      console.log(`APPLIED  ${path.basename(file)}`);
    } catch (error) {
      await client.query('rollback').catch(() => {});
      console.error(`FAILED   ${path.basename(file)}\n  ${scrub(error.message)}`);
      failed = true;
      break;
    }
  }

  await client.end();
  process.exit(failed ? 1 : 0);

}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}

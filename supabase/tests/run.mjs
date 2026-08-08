// =============================================================================
// SQL assertion-suite runner.
//
// Run:  node supabase/tests/run.mjs                  (all suites)
//       node supabase/tests/run.mjs booking_create   (one or more by name)
//
// Exists because `psql` is not installed on every machine that needs to run
// these, while `pg` already is — the Phase 5 concurrency harness depends on it.
// The suites themselves are unchanged and remain runnable with psql exactly as
// documented in README.md; this is a second way to invoke them, not a fork.
//
// Each suite wraps itself in `begin; … rollback;` and prints a per-assertion
// PASS/FAIL table plus a summary row. Nothing raises on failure, so this
// runner reads the printed result: any row containing FAIL, or a missing
// `ALL PASS`, fails the suite and sets a non-zero exit code.
//
// SUPABASE_DB_URL comes from .env.test.local (falling back to .env.local),
// is checked to be a local stack, and is never printed.
// =============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));

/*
 * `.env.test.local` first, `.env.local` only as a fallback.
 *
 * These suites wrap themselves in `begin; … rollback;`, which makes them SAFE
 * to run against a live database and is why they were originally pointed at
 * one. Two things have changed. The suites now create fixtures for features
 * that do not exist in production yet, and — more to the point — "safe because
 * every suite remembers to roll back" is a property maintained by hand across
 * seventeen files. A local stack costs nothing and removes the question.
 *
 * The URL is checked below, so a fallback to `.env.local` does not silently
 * become a production run: it stops.
 */
const candidates = ['.env.test.local', '.env.local'];

function readDbUrl() {
  for (const candidate of candidates) {
    let raw;
    try {
      raw = readFileSync(path.resolve(here, '../..', candidate), 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)$/);
      if (match) {
        return { url: match[1].trim().replace(/^["']|["']$/g, ''), source: candidate };
      }
    }
  }
  throw new Error(`SUPABASE_DB_URL not found in ${candidates.join(' or ')}`);
}

/** Local-only, on the same terms as lib/env/testDatabase.ts. */
function assertLocal(url, source) {
  const allow = ['1', 'true', 'yes'].includes(
    String(process.env.ALLOW_REMOTE_TEST_DB ?? '').toLowerCase(),
  );
  if (allow) return;

  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    host = null;
  }
  if (host && ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) return;

  throw new Error(
    `The SQL suites refuse to run against the database in ${source}.\n` +
      'Only a local Supabase stack is allowed. Run `npx supabase start` and put ' +
      'its DB_URL in .env.test.local.\n' +
      'Set ALLOW_REMOTE_TEST_DB=1 for one invocation if you genuinely mean to.',
  );
}

/*
 * Suite discovery, one directory deep.
 *
 * The v1.3 conformance suites live in `v13_conformance/` rather than beside
 * the others, because they answer a different question: the flat suites test
 * behaviour this repository built, while those assert that the database
 * already matches a contract the redesign is about to build on. Mixing them
 * would make "which of these am I allowed to fix by writing code" ambiguous.
 *
 * One level, not arbitrary recursion — a nesting depth nobody needs is a
 * discovery order nobody can predict. Directories sort after the flat suites
 * so the established ones run first and a conformance failure reads as the
 * last thing rather than the middle thing.
 */
function discover() {
  const entries = readdirSync(here, { withFileTypes: true });
  const flat = entries
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name)
    .sort();
  const nested = entries
    .filter((e) => e.isDirectory())
    .flatMap((dir) =>
      readdirSync(path.join(here, dir.name))
        .filter((f) => f.endsWith('.sql'))
        .map((f) => `${dir.name}/${f}`),
    )
    .sort();
  return [...flat, ...nested];
}

const requested = process.argv.slice(2);
const suites = requested.length
  ? requested.map((name) => (name.endsWith('.sql') ? name : `${name}.sql`))
  : discover();

const { url: dbUrl, source: dbSource } = readDbUrl();
assertLocal(dbUrl, dbSource);
let failed = 0;

for (const suite of suites) {
  const sql = readFileSync(path.join(here, suite), 'utf8');
  const client = new pg.Client({ connectionString: dbUrl });

  let verdict = 'ERROR';
  let detail = '';

  try {
    await client.connect();
    const results = await client.query(sql);
    const sets = Array.isArray(results) ? results : [results];

    // Flatten every returned row to text so the PASS/FAIL columns are visible
    // regardless of which column the suite happened to put them in.
    const lines = [];
    for (const set of sets) {
      for (const row of set?.rows ?? []) {
        lines.push(Object.values(row).map((v) => String(v)).join(' | '));
      }
    }

    const failures = lines.filter((l) => /\bFAIL\b/.test(l));
    const allPass = lines.some((l) => /ALL PASS/.test(l));

    if (failures.length > 0) {
      verdict = 'HAS FAILURES';
      detail = `\n    ${failures.slice(0, 10).join('\n    ')}`;
    } else if (allPass) {
      verdict = 'ALL PASS';
    } else {
      verdict = 'NO SUMMARY';
      detail = ' (suite printed no ALL PASS row)';
    }
  } catch (error) {
    detail = ` ${error.message}`;
  } finally {
    await client.end().catch(() => {});
  }

  if (verdict !== 'ALL PASS') failed += 1;
  console.log(`${suite.padEnd(40)} ${verdict}${detail}`);
}

console.log(
  failed === 0
    ? `\n${suites.length}/${suites.length} suites ALL PASS`
    : `\n${failed}/${suites.length} suites FAILED`,
);

process.exit(failed === 0 ? 0 : 1);

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
// SUPABASE_DB_URL is read from .env.local and never printed.
// =============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, '../../.env.local');

function readDbUrl() {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)$/);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('SUPABASE_DB_URL not found in .env.local');
}

const requested = process.argv.slice(2);
const suites = requested.length
  ? requested.map((name) => (name.endsWith('.sql') ? name : `${name}.sql`))
  : readdirSync(here)
      .filter((f) => f.endsWith('.sql'))
      .sort();

const dbUrl = readDbUrl();
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

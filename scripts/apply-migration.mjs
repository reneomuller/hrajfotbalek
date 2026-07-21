// =============================================================================
// Apply one or more migration files to the database in SUPABASE_DB_URL.
//
//   node scripts/apply-migration.mjs supabase/migrations/2026..._rpc_x.sql
//
// Exists because `psql` is not installed on every machine that needs to run
// these, while `pg` already is — same reasoning as supabase/tests/run.mjs.
//
// Each file is applied inside ONE transaction: a migration that fails halfway
// leaves nothing behind. SUPABASE_DB_URL is read from .env.local and never
// printed, and any error text is scrubbed of the connection string before it
// reaches the console.
// =============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/apply-migration.mjs <file.sql> [...]');
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

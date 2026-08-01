import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

/**
 * Time travel for the sweep specs — and NOTHING else.
 *
 * The nudge fires 12 hours before kick-off and the grace window is another 12.
 * A spec cannot wait that out, and it cannot fake it through the API either:
 * `service_role` deliberately has no UPDATE privilege on `bookings`, because
 * every state change in this product goes through an RPC. That is the right
 * design and this file does not weaken it — the E2E harness connects as the
 * database owner, exactly as the SQL suites in `supabase/tests/` do.
 *
 * THE ONE RULE HERE: this may move a TIMESTAMP and may never change a STATE.
 * `expires_at`, `nudge_sent_at` and `starts_at` are stamps and schedule; the
 * columns that carry state — `bookings.status`, `games.status` — are off
 * limits, and a spec that reached for them would be asserting against a state
 * the product cannot actually reach.
 */

function dbUrl(): string {
  const fromEnv = process.env.SUPABASE_DB_URL;
  if (fromEnv) return fromEnv;

  // `.env.test.local` first, matching every other runner in this repo. The
  // fallback stays because a machine that has only ever had `.env.local` still
  // works — and `playwright.config.ts` has already refused to start if that
  // file points anywhere but a local stack.
  const file = [".env.test.local", ".env.local"]
    .map((name) => path.resolve(process.cwd(), name))
    .find((candidate) => {
      try {
        readFileSync(candidate, "utf8");
        return true;
      } catch {
        return false;
      }
    });
  if (!file) {
    throw new Error("SUPABASE_DB_URL not found — the sweep specs need it to move the clock.");
  }
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)$/);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }

  throw new Error("SUPABASE_DB_URL not found — the sweep specs need it to move the clock.");
}

/**
 * Runs a statement as the DATABASE OWNER.
 *
 * Exported because teardown needs it too, not only the clock. `service_role`
 * is deliberately denied UPDATE and DELETE on the append-only tables, so a
 * spec that has to remove its own rows from `credit_ledger` or `credit_topups`
 * cannot do it through PostgREST — and a `.delete()` that is silently refused
 * leaves rows in the shared seed database, which is the exact failure mode the
 * disposable-fixture rule exists to prevent.
 */
export async function execAsOwner(sql: string, params: unknown[] = []): Promise<void> {
  await exec(sql, params);
}

async function exec(sql: string, params: unknown[]): Promise<void> {
  const client = new pg.Client({ connectionString: dbUrl() });
  await client.connect();
  try {
    await client.query(sql, params);
  } finally {
    await client.end();
  }
}

/**
 * Moves a booking's expiry deadline into the past, so the next expiry sweep
 * sees it as due.
 *
 * Only touches `expires_at`. The sweep still has to decide the booking is
 * expirable and `expire_booking` still has to agree — which is the behaviour
 * under test.
 */
export async function expireDeadline(bookingId: string): Promise<void> {
  await exec(
    `update public.bookings
        set expires_at = now() - interval '1 minute'
      where id = $1
        and status = 'reserved'`,
    [bookingId],
  );
}

/**
 * Moves a credit batch's expiry, so the pass sweep and the three-day heads-up
 * can be exercised without waiting a month.
 *
 * SAME RULE, AND IT IS WORTH RESTATING HERE BECAUSE THIS IS MONEY: this moves
 * a timestamp and nothing else. `service_role` has no UPDATE on
 * `credit_ledger` at all — the ledger is append-only by privilege, which is
 * why the first version of the pass spec silently did nothing — and that is
 * the design, not an obstacle. The delta, the reason and the batch links are
 * untouched; only the date the batch runs out moves, and the sweep still has
 * to decide what to do about it.
 */
export async function moveBatchExpiry(
  ledgerRowId: string,
  daysFromNow: number,
): Promise<void> {
  await exec(
    `update public.credit_ledger
        set expires_at = now() + ($2 || ' days')::interval
      where id = $1
        and expires_at is not null`,
    [ledgerRowId, String(daysFromNow)],
  );
}

/** Pulls a game's kick-off closer, to bring it inside a policy window. */
export async function moveKickoff(gameId: string, hoursFromNow: number): Promise<void> {
  await exec(
    `update public.games
        set starts_at = now() + ($2 || ' hours')::interval
      where id = $1`,
    [gameId, String(hoursFromNow)],
  );
}

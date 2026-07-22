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

  const file = path.resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)$/);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }

  throw new Error("SUPABASE_DB_URL not found — the sweep specs need it to move the clock.");
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

/** Pulls a game's kick-off closer, to bring it inside a policy window. */
export async function moveKickoff(gameId: string, hoursFromNow: number): Promise<void> {
  await exec(
    `update public.games
        set starts_at = now() + ($2 || ' hours')::interval
      where id = $1`,
    [gameId, String(hoursFromNow)],
  );
}

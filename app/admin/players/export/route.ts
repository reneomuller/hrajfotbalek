import { csvDateStamp, csvResponse, toCsv, type CsvColumn } from "@/lib/admin/csv";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { listPlayers, type AdminPlayerRow } from "@/lib/admin/queries";

/**
 * `/admin/players/export` — the player list with balances.
 *
 * THIS FILE CONTAINS EMAIL ADDRESSES, which is why the gate matters more here
 * than anywhere else in the set: it is the whole player table leaving the
 * product as a file that then lives in a Downloads folder. `requireAdmin()` runs
 * in the handler because a route handler is reachable with curl and never
 * renders under the admin layout.
 *
 * NO PHONE NUMBER, deliberately, even though `players` holds one. The balance
 * and the booking count are what an organizer reconciles; a phone number is
 * what they look up one at a time on a player page when they need to ring
 * somebody, and exporting the column would put every number in the group in one
 * file for no use anyone has asked for.
 *
 * `balance_czk` is summed from the append-only ledger by `listPlayers`, not
 * from a cached column — the same number the page shows, from the same call.
 */
export const dynamic = "force-dynamic";

const COLUMNS: CsvColumn<AdminPlayerRow>[] = [
  { header: "nickname", value: (p) => p.nickname },
  { header: "email", value: (p) => p.email },
  { header: "balance_czk", value: (p) => p.balanceCzk },
  { header: "bookings", value: (p) => p.bookingCount },
  { header: "is_shadow", value: (p) => p.isShadow },
  { header: "is_admin", value: (p) => p.isAdmin },
  { header: "is_seed", value: (p) => p.isSeed },
  { header: "player_id", value: (p) => p.id },
];

export async function GET() {
  await requireAdmin();
  const players = await listPlayers();
  return csvResponse(toCsv(COLUMNS, players), "players", csvDateStamp());
}

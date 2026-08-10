import { csvDateStamp, csvResponse, toCsv, type CsvColumn } from "@/lib/admin/csv";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getAdminGame, listGameBookings, type AdminBookingRow } from "@/lib/admin/queries";

/**
 * `/admin/games/[id]/export` — one game's roster and payments.
 *
 * THE MOST USEFUL EXPORT IN THE SET, and the reason the feature exists: this is
 * the file an organizer opens beside their banking app to reconcile a game.
 * `payment_code` is the variable symbol, and the rows arrive in the order
 * `listGameBookings` sorts them — VS order, which is the order the bank shows
 * incoming payments in.
 *
 * `amount_due_czk` is what is actually outstanding after wallet credit, which
 * is the number the bank statement will show. Price alone would be wrong for
 * every booking that spent credit, and those are the ones most likely to be
 * queried.
 *
 * A 404 rather than an empty file for a game that does not exist. An empty CSV
 * for a mistyped id looks like a game with nobody on it.
 */
export const dynamic = "force-dynamic";

const COLUMNS: CsvColumn<AdminBookingRow>[] = [
  { header: "payment_code", value: (b) => b.paymentCode },
  { header: "nickname", value: (b) => b.nickname },
  // The roster export is what an organizer balances teams from, so the level
  // belongs beside the name. Empty for a player who has not declared one.
  { header: "skill_level", value: (b) => b.skillLevel ?? "" },
  { header: "status", value: (b) => b.status },
  { header: "payment_method", value: (b) => b.paymentMethod },
  { header: "price_czk", value: (b) => b.priceCzk },
  { header: "credit_applied_czk", value: (b) => b.creditAppliedCzk },
  { header: "amount_due_czk", value: (b) => b.amountDueCzk },
  { header: "attendance", value: (b) => b.attendance },
  { header: "booked_by_admin", value: (b) => b.bookedByAdmin },
  { header: "is_seed", value: (b) => b.isSeed },
  { header: "booking_id", value: (b) => b.id },
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();

  const { id } = await params;
  const game = await getAdminGame(id);
  if (!game) return new Response("Not found", { status: 404 });

  const bookings = await listGameBookings(id);

  /*
   * The filename carries the game's DATE, not its venue. A venue is admin free
   * text — the seed's own hostile fixture contains quotes and a backslash — and
   * a filename reaches a `Content-Disposition` header, where a newline is a
   * response-splitting bug. The date and the id are both machine-shaped.
   */
  const slug = `game-${game.starts_at.slice(0, 10)}-${id.slice(0, 8)}`;
  return csvResponse(toCsv(COLUMNS, bookings), slug, csvDateStamp());
}

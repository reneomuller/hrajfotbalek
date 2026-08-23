import { canOfferCancel, isCancellationRefundable } from "@/lib/booking/badges";
import { policy } from "@/lib/policy";
import { refundCutoffHours } from "@/lib/policy/refundCutoff";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import type { Database } from "@/lib/types/database";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type GameRow = Database["public"]["Tables"]["games"]["Row"];

export interface BookingWithGame {
  booking: BookingRow;
  game: GameRow;
  /**
   * Whether to OFFER the cancel affordance. Mirrors `cancel_booking`; the RPC
   * remains the enforcement authority and is called regardless. Decided here
   * rather than during render because reading the clock in a component is
   * impure — same reason `hasStarted` lives in lib/games/queries.ts.
   */
  canCancel: boolean;
  /**
   * Whether cancelling right now would still be CREDITED (policy v2).
   *
   * A different question from `canCancel`, and v2 is where they part company:
   * cancelling stays open until kickoff, crediting stops ten hours before it.
   * Decided here for the same reason `canCancel` is — reading the clock during
   * render is impure, and `react-hooks/purity` rejects it.
   */
  refundable: boolean;
}

/**
 * A booking the signed-in player owns, with its game.
 *
 * Access control is `bookings_select_own` RLS, not a filter written here: the
 * policy restricts the row set to bookings whose player maps to `auth.uid()`,
 * so another player's booking id returns no row rather than someone else's
 * data. Adding a redundant `player_id` filter would suggest this code is the
 * enforcement point, which it is not.
 */
export async function getOwnBookingWithGame(
  bookingId: string,
): Promise<BookingWithGame | null> {
  const supabase = await createServerSupabaseClient();

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !booking) return null;

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("*")
    .eq("id", booking.game_id)
    .maybeSingle();

  if (gameError || !game) return null;

  const now = Date.now();
  // Asked once per request, deduped by `cache()` — see `refundCutoffHours`.
  const cutoff = await refundCutoffHours();
  return {
    booking,
    game,
    canCancel: decideCanCancel(booking, game, now),
    refundable: decideRefundable(game, now, cutoff),
  };
}

function decideRefundable(game: GameRow, now: number, cutoffHours: number): boolean {
  return isCancellationRefundable(game.starts_at, now, cutoffHours);
}

function decideCanCancel(booking: BookingRow, game: GameRow, now: number): boolean {
  return canOfferCancel(
    booking.status,
    game.starts_at,
    now,
    policy.cancellation.cutoffHoursBeforeStart,
  );
}

/** Every booking the signed-in player owns, soonest game first. */
export async function listOwnBookings(): Promise<BookingWithGame[]> {
  const supabase = await createServerSupabaseClient();

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !bookings || bookings.length === 0) return [];

  const gameIds = [...new Set(bookings.map((b) => b.game_id))];
  const { data: games } = await supabase.from("games").select("*").in("id", gameIds);

  const byId = new Map((games ?? []).map((g) => [g.id, g]));
  const now = Date.now();
  const cutoff = await refundCutoffHours();

  return bookings
    .map((booking) => {
      const game = byId.get(booking.game_id);
      return game
        ? {
            booking,
            game,
            canCancel: decideCanCancel(booking, game, now),
            refundable: decideRefundable(game, now, cutoff),
          }
        : null;
    })
    .filter((row): row is BookingWithGame => row !== null)
    .sort(
      (a, b) =>
        new Date(a.game.starts_at).getTime() - new Date(b.game.starts_at).getTime(),
    );
}

/**
 * Wallet balance as `SUM(delta_czk)` over the player's own ledger rows.
 *
 * Computed server-side from the ledger, which is the authority. The ledger is
 * append-only by privilege, so summing it is always correct; a balance cached
 * anywhere else would be a second source of truth able to disagree with it.
 */
export async function getOwnCreditBalance(): Promise<number> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.from("credit_ledger").select("delta_czk");
  if (error || !data) return 0;

  return data.reduce((sum, row) => sum + row.delta_czk, 0);
}

/**
 * The signed-in player's next game — the one the `/games` strip points at.
 *
 * Here rather than in the page for the reason `hasStarted` lives in
 * lib/games/queries.ts: reading the clock during render is impure, and React
 * says so out loud. The query layer already runs per request, so this is the
 * honest place for "is it still upcoming".
 *
 * Only a booking that still holds a spot counts. A cancelled or expired one is
 * not somewhere you are going, and pointing a "your next game" strip at it
 * would be actively misleading — that is the shape of booking most likely to
 * be sitting in a player's history when they open the list.
 */
export async function getOwnNextBooking(): Promise<BookingWithGame | null> {
  const bookings = await listOwnBookings();
  const now = Date.now();

  return (
    bookings.find(
      ({ booking, game }) =>
        (booking.status === "reserved" || booking.status === "confirmed") &&
        new Date(game.starts_at).getTime() > now,
    ) ?? null
  );
}


/**
 * Where a booking stands with respect to an ONLINE payment.
 *
 * FOUR STATES, AND THE DIFFERENCE BETWEEN THE MIDDLE TWO IS THE FEATURE:
 *
 *   `none`      — not an online booking, or already settled. Cash, credit and
 *                 bank-QR are all `none`, which is why nothing about them
 *                 changed in round 12.
 *   `waiting`   — inside the window. The seats are held and Stripe has not
 *                 answered yet.
 *   `expired`   — the window closed. The seats are NOT held any more; the
 *                 booking still exists and can be retried.
 *   `attention` — money arrived and no seat could be given. Only a person
 *                 resolves this, so the panel offers no button for it.
 *
 * MIRRORS `booking_holds_seat()` IN SQL, which is the authority — this decides
 * what a panel says, never whether a seat exists.
 */
export type OnlinePaymentState = "none" | "waiting" | "expired" | "attention";

export function onlinePaymentState(
  booking: Pick<
    Database["public"]["Tables"]["bookings"]["Row"],
    "status" | "payment_pending_at" | "payment_attention_at"
  >,
  now: number = Date.now(),
): OnlinePaymentState {
  if (booking.payment_attention_at) return "attention";
  if (booking.status !== "reserved" || !booking.payment_pending_at) return "none";

  const deadline =
    new Date(booking.payment_pending_at).getTime() +
    policy.booking.onlinePaymentMinutes * 60 * 1000;

  return now <= deadline ? "waiting" : "expired";
}

/**
 * The games the signed-in player is WAITLISTED on (round 16, item 12).
 *
 * WHY IT IS ITS OWN QUERY AND NOT PART OF `PlayerHistory`. That type splits
 * BOOKINGS by tense; a waitlist row is not a booking and has no tense to be
 * split on — it is a standing intention about a game that has not happened.
 * Folding it in would mean `upcoming` held two things with different actions
 * on them, which is the shape `splitHistory` exists to avoid.
 *
 * ACCESS CONTROL IS `waitlist_select_own` RLS, not a filter written here — the
 * same rule the rest of this file follows.
 *
 * CONVERTED ROWS ARE EXCLUDED. A waitlist entry that became a booking is
 * already on the upcoming list as a booking; showing it in both would tell a
 * player they are simultaneously in and waiting.
 */
export interface WaitlistedGame {
  waitlistId: string;
  joinedAt: string;
  game: GameRow;
}

export async function listOwnWaitlisted(
  now: number = Date.now(),
): Promise<WaitlistedGame[]> {
  const supabase = await createServerSupabaseClient();

  const { data: rows, error } = await supabase
    .from("waitlist")
    .select("id, game_id, joined_at")
    .is("converted_booking_id", null);

  if (error || !rows || rows.length === 0) return [];

  const { data: games } = await supabase
    .from("games")
    .select("*")
    .in("id", rows.map((row) => row.game_id));

  const byId = new Map((games ?? []).map((game) => [game.id, game]));

  return rows
    .map((row) => {
      const game = byId.get(row.game_id);
      return game ? { waitlistId: row.id, joinedAt: row.joined_at, game } : null;
    })
    .filter((row): row is WaitlistedGame => row !== null)
    /*
     * ONLY GAMES THAT HAVE NOT KICKED OFF. A waitlist row on a game that has
     * already been played is a queue nobody is in any more; the sweep that
     * clears them runs on cancellation, not on kickoff, so stale rows exist.
     */
    .filter((row) => new Date(row.game.starts_at).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.game.starts_at).getTime() - new Date(b.game.starts_at).getTime(),
    );
}

import { createServerSupabaseClient } from "@/lib/supabase/clients";
import type { Database } from "@/lib/types/database";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type GameRow = Database["public"]["Tables"]["games"]["Row"];

export interface BookingWithGame {
  booking: BookingRow;
  game: GameRow;
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

  return { booking, game };
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

  return bookings
    .map((booking) => {
      const game = byId.get(booking.game_id);
      return game ? { booking, game } : null;
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

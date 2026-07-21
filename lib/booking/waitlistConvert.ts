import { createServerSupabaseClient } from "@/lib/supabase/clients";

/**
 * Waitlist read helpers.
 *
 * The conversion WRITE lives in `app/game/[id]/waitlist/actions.ts` and goes
 * through `create_booking(from_waitlist_id)` — the same function every other
 * booking uses, which is what makes the conversion race-safe without a second
 * capacity implementation.
 *
 * Everything here is a read under own-row RLS: a player can only ever see
 * their own waitlist rows, so none of these need a player filter for safety.
 */

/** Whether the signed-in player holds an unconverted waitlist row on a game. */
export async function isOnWaitlist(gameId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("waitlist")
    .select("id")
    .eq("game_id", gameId)
    .is("converted_booking_id", null)
    .maybeSingle();

  if (error) return false;
  return data !== null;
}

/** The signed-in player's unconverted waitlist row id for a game, if any. */
export async function ownWaitlistId(gameId: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("waitlist")
    .select("id")
    .eq("game_id", gameId)
    .is("converted_booking_id", null)
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}

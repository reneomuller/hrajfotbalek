import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/clients";

/**
 * Which round-16 actions this database can perform (round 16).
 *
 * THE PROBLEM IT SOLVES. The owner applies migrations by hand, and the code
 * that needs them ships hours earlier. Every control backed by a new RPC would
 * spend that gap as a button that 404s — which round 12 already ruled against:
 * "Confirm is never live with a dead path behind it."
 *
 * `app_capabilities()` IS CREATED BY THE MIGRATION IT DESCRIBES, so its
 * absence is the signal. No flag file, no environment variable, nothing to set
 * and nothing to forget: applying the migration turns the features on, and
 * until then every flag is false and the controls do not render. There is no
 * state where a control exists and its function does not.
 *
 * WHY NOT PROBE EACH FUNCTION. There is no way to ask PostgREST whether a
 * function exists except by calling it — and for five state transitions that
 * means calling five things that change state. One `stable` function that
 * returns a shape is the only honest probe, and it is one round trip.
 *
 * FALSE ON ANY FAILURE, INCLUDING A REAL ONE. A database that is up but
 * refusing this call is indistinguishable from one without the migration, and
 * the safe reading of both is "do not offer the control". A hidden button is a
 * missing feature; a shown one is a broken promise.
 */
export interface AppCapabilities {
  leaveWaitlist: boolean;
  dismissNotifications: boolean;
  adminRemoveBooking: boolean;
  adminDelete: boolean;
  cancelWithReason: boolean;
  /** Round 18 item 2 — `games.language` and `set_game_language` exist. */
  gameLanguage: boolean;
  /** Round 23 item 1 — `players_met` exists and the public composite carries it. */
  playersMet: boolean;
  /** Round 19 item 2 — `organizer_telegram` and its normaliser exist. */
  organizerTelegram: boolean;
  /**
   * Round 27 item 2 — `can_add_guests`, `add_guests_with_credit` and the
   * register's `kind` column exist.
   *
   * FALSE IS THE OLD SHAPE, NOT A BROKEN ONE: the panel simply does not
   * render, and a player adds guests the way they always did, by booking the
   * party up front. This is the capability gate the round-23 tile established
   * and the reason the deploy is safe ahead of the migration.
   */
  addGuestsAfterBooking: boolean;
  /** Round 33 item 1 — `admin_set_display_name` exists. */
  adminRenamePlayer: boolean;
  /**
   * Round 33 item 2 — `players.player_number` exists.
   *
   * THE SURFACES DO NOT READ THIS FLAG, AND THAT IS DELIBERATE. Both admin
   * reads are `select("*")`, so the column simply is not in the row before the
   * migration and is after it, and the type declares it optional — the render
   * gates on the VALUE being there, which cannot disagree with the database the
   * way a second flag can. It is declared here because this interface mirrors
   * what `app_capabilities()` returns, and because a round report that says
   * "applied" should be answerable by one call.
   */
  playerNumbers: boolean;
  /**
   * Round 33 item 3 — `max_party_guests()` exists and returns thirteen, and
   * both `create_booking_internal` and `can_add_guests` read it.
   *
   * THE ONE FLAG THIS ROUND THAT A PLAYER WOULD FEEL. The other two guard admin
   * surfaces; this one guards a control that takes money. Offering `+7` to a
   * database still capped at three is a `PARTY_TOO_LARGE` delivered after the
   * player has chosen how to pay.
   */
  partyUpToThirteen: boolean;
  /** Round 34 item 4 — `cancel_guests` exists. */
  cancelGuests: boolean;
  /**
   * Round 34 item 3 — `checkout_outcome` projects `guest_count`.
   *
   * NOT READ BY A COMPONENT, and deliberately so: the confirmation's headline
   * falls back to "Booking confirmed" when the number is absent, which is a
   * true sentence rather than a degraded one. The flag is here because this
   * interface mirrors what `app_capabilities()` returns, and because a round
   * report that claims "applied" should be answerable by one call.
   */
  addGuestsConfirmation: boolean;
  /** Round 35 v2 item 8 — `ban_player` exists. */
  banProfile: boolean;
  /** Round 35 v2 item 2 — `credit_seat_price_czk()` returns 180. */
  priceOneEighty: boolean;
}

const NONE: AppCapabilities = {
  leaveWaitlist: false,
  dismissNotifications: false,
  adminRemoveBooking: false,
  adminDelete: false,
  cancelWithReason: false,
  gameLanguage: false,
  playersMet: false,
  organizerTelegram: false,
  addGuestsAfterBooking: false,
  adminRenamePlayer: false,
  playerNumbers: false,
  partyUpToThirteen: false,
  cancelGuests: false,
  addGuestsConfirmation: false,
  banProfile: false,
  priceOneEighty: false,
};

export const appCapabilities = cache(async (): Promise<AppCapabilities> => {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("app_capabilities");

    /*
     * A MISSING FUNCTION IS THE EXPECTED CASE and is not logged. PostgREST
     * answers an unknown function with a 404, which arrives as an error — on a
     * database without the migration that is simply the truth, and logging it
     * would write a line on every render until the owner applies it.
     */
    if (error || !data || typeof data !== "object") return NONE;

    const flags = data as Record<string, unknown>;
    const read = (key: keyof AppCapabilities) => flags[key] === true;

    return {
      leaveWaitlist: read("leaveWaitlist"),
      dismissNotifications: read("dismissNotifications"),
      adminRemoveBooking: read("adminRemoveBooking"),
      adminDelete: read("adminDelete"),
      cancelWithReason: read("cancelWithReason"),
      gameLanguage: read("gameLanguage"),
      playersMet: read("playersMet"),
      organizerTelegram: read("organizerTelegram"),
      addGuestsAfterBooking: read("addGuestsAfterBooking"),
      adminRenamePlayer: read("adminRenamePlayer"),
      playerNumbers: read("playerNumbers"),
      partyUpToThirteen: read("partyUpToThirteen"),
      cancelGuests: read("cancelGuests"),
      addGuestsConfirmation: read("addGuestsConfirmation"),
      banProfile: read("banProfile"),
      priceOneEighty: read("priceOneEighty"),
    };
  } catch {
    return NONE;
  }
});

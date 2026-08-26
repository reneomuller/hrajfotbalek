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
  /** Round 19 item 2 — `organizer_telegram` and its normaliser exist. */
  organizerTelegram: boolean;
}

const NONE: AppCapabilities = {
  leaveWaitlist: false,
  dismissNotifications: false,
  adminRemoveBooking: false,
  adminDelete: false,
  cancelWithReason: false,
  gameLanguage: false,
  organizerTelegram: false,
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
      organizerTelegram: read("organizerTelegram"),
    };
  } catch {
    return NONE;
  }
});

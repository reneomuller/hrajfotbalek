import { cache } from "react";
import { policy } from "@/lib/policy";
import { createServerSupabaseClient } from "@/lib/supabase/clients";

/**
 * The refund cutoff the DATABASE is actually enforcing (round 16, item 6).
 *
 * WHY THIS IS NOT JUST `policy.cancellation.refundCutoffHoursBeforeStart`.
 * That number is a hand-kept mirror of a constant inside `cancel_booking`,
 * and the v2 migration's own comment said what that costs: "if the two
 * disagree, the database is right and the UI is lying." They disagree exactly
 * once per policy change — between the migration landing and the deploy that
 * matches it — and in that window the product promises a refund it will not
 * pay. It is the only kind of drift here that costs a player money.
 *
 * `cancellation_refund_cutoff_hours()` is that constant, read out. The
 * fallback is not a safety net for an error; it is the CORRECT answer on a
 * database that predates policy v3, where 10 is genuinely what
 * `cancel_booking` enforces. So both branches are right for the database they
 * describe, and there is no third state where the screen and the rule differ.
 *
 * `cache()` DEDUPES IT PER REQUEST. A game page asks through the claim bar,
 * the booking list and the FAQ panel; without this that is three round trips
 * for a number that cannot change mid-render.
 *
 * IT IS NOT THE ENFORCEMENT. `cancel_booking` decides; this only decides what
 * the player is told beforehand. A caller who skips it is rude, not dangerous.
 */
export const refundCutoffHours = cache(async (): Promise<number> => {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("cancellation_refund_cutoff_hours");

    /*
     * A MISSING FUNCTION IS THE EXPECTED CASE, not an error to shout about.
     * PostgREST answers an unknown function with a 404, which arrives here as
     * an error — and on a pre-v3 database that is simply the truth. Logging it
     * would put a line in production's logs on every render until the
     * migration is applied.
     */
    if (error || typeof data !== "number") {
      return policy.cancellation.refundCutoffHoursBeforeStart;
    }
    return data;
  } catch {
    return policy.cancellation.refundCutoffHoursBeforeStart;
  }
});

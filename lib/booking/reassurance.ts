import { strings } from "@/lib/strings";

/**
 * The cancellation-policy line shown before a player commits to a booking.
 *
 * Reassurance only — `cancel_booking` remains the enforcement authority, and
 * this mirrors it the same way `canOfferCancel` does. The window comes from
 * `lib/policy.ts` as an argument rather than being read here, so the copy
 * cannot drift from the rule and a v2 policy bump moves the sentence with it:
 * a zero cutoff reads "before kickoff", any other reads "up to Nh before".
 */
export function cancellationReassurance(cutoffHoursBeforeStart: number): string {
  if (cutoffHoursBeforeStart <= 0) {
    return strings.booking.cancelReassuranceKickoff;
  }
  return strings.booking.cancelReassuranceCutoff.replace(
    "{hours}",
    String(cutoffHoursBeforeStart),
  );
}

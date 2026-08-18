import { strings, type Strings } from "@/lib/strings";

/**
 * The cancellation-policy line shown before a player commits to a booking.
 *
 * Reassurance only — `cancel_booking` remains the enforcement authority, and
 * this mirrors it. The window comes from `lib/policy.ts` as an argument rather
 * than being read here, so the copy cannot drift from the rule: a zero cutoff
 * reads "before kickoff", any other reads "up to Nh before".
 *
 * IT IS THE REFUND CUTOFF THAT BELONGS HERE, NOT THE CANCELLATION WINDOW.
 * Under v1 the two were one number and either would have done. Under v2 they
 * differ — cancelling stays open to kickoff, crediting stops ten hours before
 * — and this sentence has always been about the MONEY: every variant of it
 * ends "for full wallet credit". Passing the cancellation window here would
 * print "Cancel anytime before kickoff for full wallet credit", which is now
 * two true halves making one false promise.
 */
export function cancellationReassurance(
  refundCutoffHoursBeforeStart: number,
  t: Strings = strings,
): string {
  if (refundCutoffHoursBeforeStart <= 0) {
    return t.booking.cancelReassuranceKickoff;
  }
  return t.booking.cancelReassuranceCutoff.replace(
    "{hours}",
    String(refundCutoffHoursBeforeStart),
  );
}

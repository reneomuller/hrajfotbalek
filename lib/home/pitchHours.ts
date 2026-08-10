import { resolveDurationMinutes } from "@/lib/games/duration";

/**
 * Hours on the pitch, from a month's attended game durations.
 *
 * THE NULL FALLBACK IS THE WHOLE REASON THIS IS A FUNCTION. Every game
 * created before `duration_minutes` existed carries null, and summing those
 * as zero would report a regular's month an hour short per game — a number
 * that stays perfectly plausible while being wrong, which is the failure mode
 * worth a test rather than a comment. It resolves through
 * `resolveDurationMinutes`, the same helper the card, the `.ics` and the
 * schema.org block use, so the fallback is the policy's and not this file's.
 *
 * ONE DECIMAL. Hours are the unit a reader thinks in and minutes are not, but
 * "3 hours" for 170 minutes is a rounding a player who was there would notice.
 */
export function pitchHours(durationsMinutes: (number | null)[]): number {
  const minutes = durationsMinutes.reduce<number>(
    (total, duration) => total + resolveDurationMinutes(duration),
    0,
  );
  return Math.round((minutes / 60) * 10) / 10;
}

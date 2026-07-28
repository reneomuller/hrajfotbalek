/**
 * Versioned policy windows.
 *
 * These are configuration *values*, never branches: a v2 policy is a bump to
 * this file plus a new `policy_version` stamp, not a code change. Nothing in
 * the app may hardcode one of these windows inline — email copy, cron sweeps
 * and UI affordances all read from here.
 *
 * The stamp written onto `events.policy_version` must match `POLICY_VERSION`.
 */
export const POLICY_VERSION = "v1" as const;

export const policy = {
  version: POLICY_VERSION,

  /**
   * Cancellation is permitted while the game is `published` or `full` and
   * `now() < starts_at` — i.e. right up to kickoff, with no lead-time cutoff.
   * After kickoff the outcome is determined solely by attendance marking.
   * `cancel_booking` is the enforcement authority; the UI only mirrors this.
   */
  cancellation: {
    /** Hours before `starts_at` after which cancelling is refused. 0 = until kickoff. */
    cutoffHoursBeforeStart: 0,
    /** Cancelling returns value as wallet credit — money never leaves the system. */
    refundAs: "credit",
  },

  /**
   * Scarcity nudge: an unpaid reservation on a game starting within this window
   * gets one "pay online or lose the spot" notice. `nudge_sent_at` is the
   * idempotency guard — the sweep never nudges the same booking twice.
   */
  nudge: {
    hoursBeforeStart: 12,
  },

  /**
   * An unpaid reservation holds until game day by default: `expires_at` stays
   * null until the booking has been nudged, at which point it becomes
   * `nudged_at + graceHoursAfterNudge`.
   */
  expiry: {
    graceHoursAfterNudge: 12,
  },

  /** Pre-game reminder to everyone holding a confirmed spot. */
  reminder: {
    hoursBeforeStart: 24,
  },

  /**
   * How long a game is considered in progress after `starts_at`.
   *
   * `games` stores no end time, so "is this game happening right now" has to
   * come from somewhere. It is a policy value rather than a magic number in a
   * component, and it is display-only: nothing transitions on it. When games
   * gain an `ends_at` column this constant is deleted, not reinterpreted.
   *
   * M5 DECISION (superseded) — the constant stayed for launch and no per-game
   * column was added, on the reasoning that nothing but display reads an end
   * time and every game this product ran was in fact 90 minutes. The second
   * half of that stopped being true, which was always the stated signal to
   * revisit: "when a game of a genuinely different length is scheduled".
   *
   * PHASE 2 RULING (2026-07-28, hrajsport.cz spec v1.1.1) — `games` gains a
   * nullable `duration_minutes`, a free numeric input bounded 30–180 with the
   * admin form defaulting to 60. **60 is the standard match length; 90 is now
   * the occasional per-game choice**, which is the exact inversion of the M5
   * assumption, so this constant moves 90 -> 60 with it.
   *
   * Changing it was safe to do ahead of the column because the games table was
   * empty at the time — the pre-launch reset cleared it — so no existing row's
   * rendering changed. It would NOT have been safe afterwards: with rows in
   * place, editing the fallback silently rewrites how every past game reads.
   *
   * This stays display-only — nothing transitions on it, so it is not a policy
   * window and `POLICY_VERSION` does not move. Once `duration_minutes` ships,
   * every time-range display (card, detail, `.ics`, schema.org `endDate`) reads
   * the per-game value and falls back here only when it is null. This is the
   * one fallback: `lib/calendar/ics.ts` derives its default from this value
   * rather than carrying its own, so the two cannot drift apart again.
   */
  game: {
    durationMinutes: 60,
  },
} as const;

export type Policy = typeof policy;

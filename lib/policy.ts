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
   * M5 DECISION — the constant stays for launch; no `ends_at` column is added.
   * The open question from the M3 session was whether to make the end time a
   * per-game column. Two things settle it against, for now:
   *
   *   1. Nothing reads it but display — the "in progress" label and the
   *      schema.org `endDate` (lib/games/schemaOrg.ts). No RPC, no sweep and
   *      no state transition consults an end time, so a column would carry no
   *      authority that this value does not already carry.
   *   2. A column is not free: a migration, a required field in the admin game
   *      form, validation against `starts_at`, a backfill for every existing
   *      row, and one more thing to get wrong at 8pm on a Tuesday. Every game
   *      this product runs is in fact 90 minutes.
   *
   * Revisit when a game of a genuinely different length is scheduled — that is
   * the signal, not the passage of time. The `venues` table shows the shape it
   * would take: introduce it nullable, fall back to this constant when null.
   */
  game: {
    durationMinutes: 90,
  },
} as const;

export type Policy = typeof policy;

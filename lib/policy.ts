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
export const POLICY_VERSION = "v2" as const;

export const policy = {
  version: POLICY_VERSION,

  /**
   * POLICY v2 (migration 40, applied 2026-08-19) SPLITS ONE WINDOW INTO TWO,
   * and the split is the whole point of the version bump.
   *
   * Under v1 these were the same question: cancelling was permitted until
   * kickoff and always credited, so one number answered both. v2 keeps
   * cancellation open to kickoff but stops the refund ten hours before it — so
   * "may I cancel?" and "do I get my money back?" now have different answers,
   * and a single constant cannot express that.
   *
   * `cancel_booking` is the enforcement authority for both. The UI mirrors it.
   */
  cancellation: {
    /**
     * Hours before `starts_at` after which CANCELLING ITSELF is refused.
     *
     * STILL ZERO, and deliberately so. A player who cannot come should always
     * be able to free the spot; a rule that punishes them for saying so
     * produces no-shows instead of cancellations, which is worse for everyone
     * still hoping to play. The RPC's window gate is unchanged: `published` or
     * `full`, and `now() < starts_at`.
     *
     * Read by `canOfferCancel`, which decides whether the affordance is shown.
     * SETTING THIS TO 10 WOULD HIDE THE CANCEL BUTTON inside the last ten
     * hours — the opposite of the ruling, and the reason the refund cutoff
     * below is a second value rather than a new meaning for this one.
     */
    cutoffHoursBeforeStart: 0,
    /**
     * Hours before `starts_at` after which a cancellation earns NO credit.
     *
     * At or beyond this lead the refund is exactly what v1 gave: full value for
     * money actually applied, pass credit returning to its own batch with that
     * batch's expiry. Inside it, the spot is released and nothing is credited;
     * `cancel_booking` records `forfeited_czk` on the `booking_cancelled`
     * event so a later complaint can be answered from the log.
     *
     * This is the number the player-facing copy describes — see
     * `cancellationReassurance`, which reads THIS rather than the window above.
     *
     * RESTATED IN SQL as `v_cutoff_hours` inside `cancel_booking`, because SQL
     * cannot read this file. The two MUST change together; the database is the
     * authority and this is the mirror.
     */
    refundCutoffHoursBeforeStart: 10,
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

  /**
   * BRINGING PEOPLE (round 11, part B).
   *
   * `maxPartyGuests` is the number of EXTRA seats one booking may hold, so a
   * party is at most `1 + maxPartyGuests` people. Three is the owner's figure:
   * `+1/+2/+3`.
   *
   * DISPLAY ONLY, AND THIS IS THE SECOND WINDOW THAT SAYS SO. Like
   * `cancellation`, the authority is in SQL — `create_booking_internal` holds
   * its own `v_max_guests` and raises `PARTY_TOO_LARGE` — because a route
   * guard is skipped by anyone using curl. If the two disagree, the database
   * is right and the UI is lying. Moving the ceiling means editing both, in
   * one commit, and the SQL comment says so too.
   *
   * NOT A `POLICY_VERSION` BUMP. Nothing transitions on it and no event is
   * stamped with it: it bounds a control's options, and a booking made at a
   * party of three does not become invalid if the ceiling later moves to four.
   */
  booking: {
    maxPartyGuests: 3,
    /**
     * How long an unpaid ONLINE booking holds its seats (round 12).
     *
     * DISPLAY ONLY, and the third window that lives in two places. The
     * authority is `online_payment_window()` in SQL, which
     * `booking_holds_seat()` reads and every seat count goes through. This
     * value exists so the awaiting-payment panel can say "30 minutes" without
     * a literal in a component.
     *
     * NOT A `POLICY_VERSION` BUMP: nothing transitions on it. A stale pending
     * does not change status, is not swept, and simply stops being counted —
     * which is what lets this ship without a cron job.
     */
    onlinePaymentMinutes: 30,
  },
} as const;

export type Policy = typeof policy;

/*
 * A LEAF MODULE, AND THE RELATIVE IMPORT IS WHY (round 16, item 20's lesson
 * applied again). `scripts/fixtures.ts` is run by a plain node ESM loader with
 * no `@/` alias, so an aliased import here breaks the seed — which is how this
 * file first reached the seed and failed. `lib/policy` is itself a leaf.
 */
import { policy } from "../policy.ts";

/**
 * What a game costs a card, from how long it is (round 35 v5, item 2).
 *
 * THE OWNER'S RULING: sixty minutes is 150 CZK, ninety is 180. The price is not
 * a field somebody types any more — it is a consequence of the length, decided
 * once at creation.
 *
 * `public.price_for_duration()` IS THE AUTHORITY and this mirrors it for
 * display, which is the same arrangement every policy window here has: a route
 * guard is skipped by anyone using curl, and `admin_create_game_v2` derives the
 * stored price whatever a caller sends. If the two ever disagree the database
 * is right and the form is lying.
 *
 * WHY IT IS A MAPPING AND NOT A CONSTANT. Round 35 v2 audited a flat price and
 * found it in four places — one of them inside a CHECK constraint. A number
 * that is the same everywhere invites a copy; a FUNCTION of something else has
 * to be called.
 *
 * ANYTHING THAT IS NOT SIXTY TAKES THE NINETY-MINUTE PRICE, and that is a
 * pre-pick rather than a tier. Production holds exactly one game of another
 * length — 120 minutes, settled, 2026-08-27 — so the choice costs nothing today
 * and the owner rules on it when a second one appears.
 *
 * NULL IS SIXTY. `games.duration_minutes` is nullable and a null row renders as
 * the standard length, so it is priced as one.
 */
export const DURATION_PRICE_CZK = {
  /** The standard length, and `policy.game.durationMinutes`. */
  60: 150,
  /** The length a credit buys — see `CREDIT_SEAT_MINUTES`. */
  90: 180,
} as const;

/** The length one credit is good for. Any other length is online-only. */
export const CREDIT_SEAT_MINUTES = 90;

/** How long this game is, resolving null to the standard length. */
export function durationMinutesOf(minutes: number | null | undefined): number {
  return minutes ?? policy.game.durationMinutes;
}

export function priceForDurationCzk(minutes: number | null | undefined): number {
  return durationMinutesOf(minutes) === 60
    ? DURATION_PRICE_CZK[60]
    : DURATION_PRICE_CZK[90];
}

/**
 * Does this game take credit at all?
 *
 * A CREDIT IS ONE 90-MINUTE SEAT, so a game of any other length is online-only
 * and no credit control renders for it. This is the ONE predicate every surface
 * asks — the booking form, the add-guests panel and the server action behind
 * each — so the three cannot disagree about which games take credit.
 */
export function gameTakesCredit(minutes: number | null | undefined): boolean {
  return durationMinutesOf(minutes) === CREDIT_SEAT_MINUTES;
}

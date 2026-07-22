/**
 * The state shape shared by the game-transition actions.
 *
 * Publish, mark-played and settle are all "post a game id, get a verdict"
 * actions, and none of them reads its previous state — the database decides
 * what is legal, not what the last click returned. Typing their `prevState`
 * parameter as this common shape is what lets one dumb button component drive
 * all of them without a cast: each action's own state type extends this, and
 * the extras (an outstanding-bookings list, a field-error map) belong to the
 * pages that render them.
 */
export interface TransitionState {
  status: string;
  message?: string;
}

/**
 * The claim bar's state, as a pure function of the facts (v1.3 §2.4, ruling G).
 *
 * THE BAR IS PRESENT ON EVERY GAME DETAIL, IN EVERY STATE. That is the change
 * this file exists to make. The previous bar rendered under
 * `canAct && !holdsSpot && !isFull`, so five of the seven states were the
 * ABSENCE of the control: a holder, a waiting player, a full game, a started
 * game and a cancelled game each got a page whose bottom edge was empty. The
 * brief's bug 1 — "the bar is transparent" — was the visible half of a bar that
 * was also frequently missing.
 *
 * WHY THIS IS A FUNCTION AND NOT A CHAIN OF `&&` IN THE PAGE. Every one of
 * these facts can be true simultaneously — a player can hold a paid spot on a
 * full game that has since been cancelled, while sitting on the waitlist for it
 * from before they were let in. Which fact wins is a decision, and in the
 * previous arrangement it was distributed across four JSX conditions in two
 * files, where it could only be read by simulating it. Here the order is one
 * `if` ladder with the reasoning attached, and the precedence has tests.
 *
 * IT DECIDES WHAT TO SHOW, NEVER WHAT IS ALLOWED. Every transition behind these
 * states is a `SECURITY DEFINER` RPC that re-checks its own authorization —
 * `create_booking`, `join_waitlist`, `cancel_booking`. Nothing here is a guard;
 * a bar that offered the wrong control would produce a refused RPC, not a wrong
 * write.
 */

export interface ClaimBarFacts {
  isCancelled: boolean;
  hasStarted: boolean;
  /** The viewer holds an active booking on this game. */
  holdsSpot: boolean;
  /** Nothing is owed on that booking — credit, seed, or a confirmed payment. */
  bookingPaid: boolean;
  /** Price less credit applied. May be zero or negative; both mean paid. */
  amountDueCzk: number;
  /** Whether the cancel affordance should be offered (mirrors `cancel_booking`). */
  canCancel: boolean;
  onWaitlist: boolean;
  /** Place in the queue, or null when the RPC could not answer. */
  waitlistPosition: number | null;
  isFull: boolean;
  signedIn: boolean;
}

export type ClaimBarState =
  | { kind: "cancelled" }
  | { kind: "started" }
  | { kind: "holding-paid"; canCancel: boolean }
  | { kind: "holding-unpaid"; amountDueCzk: number; canCancel: boolean }
  | { kind: "waitlisted"; position: number | null }
  | { kind: "full" }
  | { kind: "open-signed-in" }
  | { kind: "open-signed-out" };

export function claimBarState(f: ClaimBarFacts): ClaimBarState {
  /*
   * TERMINAL STATES FIRST, and they outrank a held spot.
   *
   * A cancelled game is not a spot to cancel: the refund is automatic and has
   * already happened, so `Cancel` would be a control with nothing to do and a
   * promise `cancel_booking` would refuse. A started game is the same argument
   * from the other end — policy v1 permits cancelling right up to kickoff and
   * not after, so a cancel offered here is a button that fails.
   */
  if (f.isCancelled) return { kind: "cancelled" };
  if (f.hasStarted) return { kind: "started" };

  /*
   * A HOLDER IS NEVER OFFERED A CLAIM OR A QUEUE (§5.6).
   *
   * Above `isFull` deliberately: a full game is often full BECAUSE of the
   * person reading, and the failure this prevents is the page asking a player
   * who has already paid to claim the spot they are standing on.
   */
  if (f.holdsSpot) {
    /*
     * Paid means NOTHING IS OWED, which is not the same as "a payment was
     * taken". Credit settles at booking time whatever the game's price; a cash
     * booking part-settled to exactly zero is paid in every sense the reader
     * cares about; and over-credit leaves the figure negative, which is the
     * ledger's business and not the player's. All three must read `Paid`,
     * because `0 CZK due` is a sentence no bar should print.
     */
    if (f.bookingPaid || f.amountDueCzk <= 0) {
      return { kind: "holding-paid", canCancel: f.canCancel };
    }
    return {
      kind: "holding-unpaid",
      amountDueCzk: f.amountDueCzk,
      canCancel: f.canCancel,
    };
  }

  /*
   * WAITING OUTRANKS FULL, so the queue is never offered to someone already in
   * it. Note this does not require `isFull`: a spot can open while a player is
   * still on the list, and `Join waitlist` on a game they are already waiting
   * for is the exact confusion the fourth row of §2.4 exists to end.
   */
  if (f.onWaitlist) return { kind: "waitlisted", position: f.waitlistPosition };

  if (f.isFull) return { kind: "full" };

  // No pre-auth hold: a signed-out visitor may walk the whole flow and
  // authenticate at the end, so the bar advertises the destination rather than
  // putting a wall in front of it.
  return f.signedIn ? { kind: "open-signed-in" } : { kind: "open-signed-out" };
}

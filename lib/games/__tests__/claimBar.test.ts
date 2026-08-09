import { describe, expect, it } from "vitest";
import { claimBarState, type ClaimBarFacts } from "@/lib/games/claimBar";

/**
 * v1.3 §2.4, ruling G — the claim bar's seven states.
 *
 * The bar is PRESENT ON EVERY GAME DETAIL, IN EVERY STATE, which is the whole
 * change: the previous bar rendered only under `canAct && !holdsSpot &&
 * !isFull`, so a holder, a waiting player, a full game, a started game and a
 * cancelled game each got no bar at all — five of the seven states were the
 * absence of the control.
 *
 * Tested as a pure function rather than through the page because the thing
 * that can be wrong is the PRECEDENCE, and precedence is invisible in a
 * rendering: every one of these facts can be true at once, and which one wins
 * is a decision that has to be stated somewhere a test can reach.
 */

/** Everything false — a signed-out visitor on an open game. */
const OPEN: ClaimBarFacts = {
  isCancelled: false,
  hasStarted: false,
  holdsSpot: false,
  bookingPaid: false,
  amountDueCzk: 0,
  canCancel: false,
  onWaitlist: false,
  waitlistPosition: null,
  isFull: false,
  signedIn: false,
};

const facts = (over: Partial<ClaimBarFacts>): ClaimBarFacts => ({ ...OPEN, ...over });

describe("claimBarState", () => {
  it("offers the claim to a signed-in visitor on an open game", () => {
    expect(claimBarState(facts({ signedIn: true }))).toEqual({ kind: "open-signed-in" });
  });

  it("offers sign-in to a signed-out visitor rather than nothing", () => {
    // No pre-auth hold: the visitor may walk the whole flow and authenticate at
    // the end, so the bar advertises the destination rather than a wall.
    expect(claimBarState(OPEN)).toEqual({ kind: "open-signed-out" });
  });

  it("offers the waitlist on a full game", () => {
    expect(claimBarState(facts({ isFull: true, signedIn: true }))).toEqual({
      kind: "full",
    });
  });

  it("shows the position, not a button, to someone already waiting", () => {
    /*
     * The fourth row of §2.4 and the reason it exists: without it a waiting
     * player sees `Join waitlist` indefinitely, with no way to tell whether the
     * tap worked and no way to know where they stand, while the notify-all
     * emails keep arriving.
     */
    expect(
      claimBarState(
        facts({ isFull: true, signedIn: true, onWaitlist: true, waitlistPosition: 3 }),
      ),
    ).toEqual({ kind: "waitlisted", position: 3 });
  });

  it("still says waiting when the position could not be read", () => {
    // `waitlist_position` is an RPC and can come back null. "You are waiting"
    // with no number beats falling back to `Join waitlist`, which would invite
    // a second join.
    expect(
      claimBarState(facts({ isFull: true, signedIn: true, onWaitlist: true })),
    ).toEqual({ kind: "waitlisted", position: null });
  });

  it("shows Paid and a cancel to a holder who owes nothing", () => {
    expect(
      claimBarState(facts({ signedIn: true, holdsSpot: true, bookingPaid: true, canCancel: true })),
    ).toEqual({ kind: "holding-paid", canCancel: true });
  });

  it("shows what is due to a holder who has not paid", () => {
    expect(
      claimBarState(
        facts({ signedIn: true, holdsSpot: true, amountDueCzk: 150, canCancel: true }),
      ),
    ).toEqual({ kind: "holding-unpaid", amountDueCzk: 150, canCancel: true });
  });

  it("says kicked off, with no button, once the game has started", () => {
    expect(claimBarState(facts({ hasStarted: true, signedIn: true }))).toEqual({
      kind: "started",
    });
  });

  it("says cancelled, with no button, on a cancelled game", () => {
    expect(claimBarState(facts({ isCancelled: true, signedIn: true }))).toEqual({
      kind: "cancelled",
    });
  });

  describe("precedence — every fact can be true at once", () => {
    it("puts CANCELLED above everything, including a held spot", () => {
      // A cancelled game is not a spot to cancel. The refund is automatic and
      // has already happened; offering `Cancel` here would be a control with
      // nothing to do and a promise the RPC would refuse.
      expect(
        claimBarState(
          facts({
            isCancelled: true,
            hasStarted: true,
            holdsSpot: true,
            bookingPaid: true,
            canCancel: true,
            isFull: true,
            signedIn: true,
          }),
        ),
      ).toEqual({ kind: "cancelled" });
    });

    it("puts STARTED above a held spot", () => {
      // Policy v1 permits cancelling right up to kickoff and not after, so a
      // cancel offered on a started game is a button that fails.
      expect(
        claimBarState(
          facts({ hasStarted: true, holdsSpot: true, bookingPaid: true, canCancel: true }),
        ),
      ).toEqual({ kind: "started" });
    });

    it("puts a HELD SPOT above full and above the waitlist", () => {
      // A holder is never offered a claim or a queue (§5.6) — the failure this
      // prevents is a page asking a player who has already paid to claim the
      // spot they are standing on. A full game is full BECAUSE of them.
      expect(
        claimBarState(
          facts({
            holdsSpot: true,
            bookingPaid: true,
            canCancel: true,
            isFull: true,
            onWaitlist: true,
            waitlistPosition: 2,
            signedIn: true,
          }),
        ),
      ).toEqual({ kind: "holding-paid", canCancel: true });
    });

    it("puts WAITING above full, so the queue is never offered twice", () => {
      expect(
        claimBarState(
          facts({ isFull: true, onWaitlist: true, waitlistPosition: 1, signedIn: true }),
        ),
      ).toEqual({ kind: "waitlisted", position: 1 });
    });

    it("puts FULL above the claim, whatever the session says", () => {
      expect(claimBarState(facts({ isFull: true, signedIn: true }))).toEqual({
        kind: "full",
      });
    });
  });

  describe("the paid/unpaid split", () => {
    it("treats a settled wallet booking as paid even with a price on it", () => {
      // Credit settles at booking time, so nothing is owed however large the
      // game's price is. `bookingPaid` is the authority; the amount is display.
      expect(
        claimBarState(
          facts({ holdsSpot: true, bookingPaid: true, amountDueCzk: 200, signedIn: true }),
        ),
      ).toMatchObject({ kind: "holding-paid" });
    });

    it("treats a zero balance due as paid, so no bar ever says 0 CZK due", () => {
      // A cash booking part-settled to exactly zero is paid in every sense the
      // reader cares about, and `0 CZK due` is a sentence no bar should print.
      expect(
        claimBarState(facts({ holdsSpot: true, amountDueCzk: 0, signedIn: true })),
      ).toMatchObject({ kind: "holding-paid" });
    });

    it("never reports a negative amount due", () => {
      // Over-credit is possible in the ledger and is not the player's problem.
      expect(
        claimBarState(facts({ holdsSpot: true, amountDueCzk: -50, signedIn: true })),
      ).toMatchObject({ kind: "holding-paid" });
    });
  });
});

import { policy } from "@/lib/policy";

/**
 * What a party owes for one game (round 27, item 1).
 *
 * EXTRACTED SO IT CAN BE ASSERTED. The arithmetic was one inline expression in
 * `/payment/checkout` — `game.price_czk * seats` — which is correct and was
 * unreachable from a test, because reaching it needs a Stripe secret key. The
 * rule it encodes is the one the whole embedded-checkout item exists for, so
 * it gets a name and a spec rather than a comment.
 *
 * THE SHAPE IS THE POINT: one amount, already multiplied out. Stripe is sent
 * `quantity: 1` and this number as the whole line, never a unit price and a
 * quantity — because a quantity is a field the buyer can edit on some Stripe
 * surfaces, and the price of a booking is not a thing the buyer chooses. A
 * party of three is one line of 450 CZK, not three lines of 150.
 *
 * NO WALLET CREDIT IS SUBTRACTED HERE, deliberately (round 27, item 1, the
 * owner's rule). Choosing "Online payment" moves ZERO credit: the wallet is
 * spent only by an explicit Redeem-credit booking, which travels the `cash`
 * rail and never reaches this function. Mixing the two would also force the
 * webhook to reconstruct which half of an amount was which.
 */
export function partySeats(guests: number): number {
  /*
   * A GARBLED GUEST COUNT BECOMES ZERO rather than refusing, which is the same
   * rule `createBookingAction` applies to the same value a step earlier: the
   * player is booked alone instead of being turned away over a query string.
   * The ceiling is the policy's, so a hand-edited URL cannot buy a party of
   * fifty at a discount it invented.
   */
  const clean =
    Number.isInteger(guests) && guests > 0
      ? Math.min(guests, policy.booking.maxPartyGuests)
      : 0;
  return 1 + clean;
}

/** The whole party price: the per-seat price times the player plus guests. */
export function partyAmountCzk(priceCzk: number, guests: number): number {
  return priceCzk * partySeats(guests);
}

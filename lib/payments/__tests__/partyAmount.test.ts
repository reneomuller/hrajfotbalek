import { describe, expect, it } from "vitest";
import { partyAmountCzk, partySeats } from "@/lib/payments/partyAmount";
import { policy } from "@/lib/policy";

/**
 * ROUND 27, ITEM 1 — the party math, asserted rather than trusted.
 *
 * The outage this round fixed was in the same file as this arithmetic, and the
 * arithmetic had never been checked by anything: reaching it through the
 * product needs a Stripe secret key, which no test environment has. Extracting
 * it made it reachable. `+2` is the case the round asked for by name.
 */

describe("partySeats", () => {
  it("counts the player alone when there are no guests", () => {
    // Arrange / Act
    const seats = partySeats(0);

    // Assert
    expect(seats).toBe(1);
  });

  it("counts the player plus their guests", () => {
    // Arrange / Act
    const seats = partySeats(2);

    // Assert
    expect(seats).toBe(3);
  });

  it("caps a hand-edited guest count at the policy ceiling", () => {
    // Arrange
    const absurd = policy.booking.maxPartyGuests + 40;

    // Act
    const seats = partySeats(absurd);

    // Assert
    expect(seats).toBe(1 + policy.booking.maxPartyGuests);
  });

  it("treats a garbled guest count as booking the player alone", () => {
    // Arrange
    const garbled = [Number.NaN, -3, 1.5];

    // Act
    const seats = garbled.map(partySeats);

    // Assert
    expect(seats).toEqual([1, 1, 1]);
  });
});

describe("partyAmountCzk", () => {
  it("charges one seat at the game price for a lone booking", () => {
    // Arrange / Act
    const amount = partyAmountCzk(150, 0);

    // Assert
    expect(amount).toBe(150);
  });

  it("charges price × (1 + guests) at +2 — the round's named case", () => {
    // Arrange
    const priceCzk = 150;

    // Act
    const amount = partyAmountCzk(priceCzk, 2);

    // Assert: three seats, one line, no quantity anywhere.
    expect(amount).toBe(450);
  });

  it("multiplies out at a non-default price too", () => {
    // Arrange / Act
    const amount = partyAmountCzk(180, 2);

    // Assert
    expect(amount).toBe(540);
  });

  it("never subtracts wallet credit — online payment moves zero credit", () => {
    /*
     * THE OWNER'S RULE AS A SPEC, NOT A TRUST (round 27, item 1). There is no
     * credit parameter to pass, which is the strongest form this assertion can
     * take: the function cannot apply credit even if a caller wanted it to.
     */
    // Arrange / Act
    const amount = partyAmountCzk(150, 1);

    // Assert
    expect(amount).toBe(300);
    expect(partyAmountCzk.length).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import {
  encodePendingPurchase,
  parsePendingPurchase,
  PENDING_PURCHASE_COOKIE,
  purchaseDestination,
} from "@/lib/payments/pendingPurchase";

const UUID = "0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0";
const OTHER = "11111111-2222-4333-8444-555555555555";

describe("encode / parse round trip", () => {
  it("carries the kind and the id", () => {
    // Arrange
    const stash = { kind: "booking", id: UUID } as const;

    // Act
    const back = parsePendingPurchase(encodePendingPurchase(stash));

    // Assert
    expect(back).toEqual(stash);
  });

  it("carries a pass purchase the same way", () => {
    // Arrange
    const stash = { kind: "pass", id: OTHER } as const;

    // Act
    const back = parsePendingPurchase(encodePendingPurchase(stash));

    // Assert
    expect(back).toEqual(stash);
  });
});

/*
 * THE VALUE ARRIVES FROM A COOKIE, WHICH IS TO SAY FROM THE CLIENT.
 *
 * It is written by a server action and `httpOnly`, so a browser cannot edit
 * it — but "cannot" here is a property of one browser's honesty, and the
 * parse is what makes it a property of this code. A malformed value must
 * produce null and send the return page down its fallback, never a database
 * lookup on a string somebody chose.
 */
describe("parsePendingPurchase refuses anything it did not write", () => {
  it.each([
    ["empty", ""],
    ["no separator", UUID],
    ["unknown kind", `wallet:${UUID}`],
    ["id that is not a uuid", "booking:not-a-uuid"],
    ["a path traversal in the id", "booking:../../admin"],
    ["a second separator", `booking:${UUID}:pass`],
    ["whitespace only", "   "],
  ])("returns null for %s", (_label, raw) => {
    // Act
    const parsed = parsePendingPurchase(raw);

    // Assert
    expect(parsed).toBeNull();
  });

  it("returns null for undefined, which is the no-cookie case", () => {
    expect(parsePendingPurchase(undefined)).toBeNull();
  });
});

/*
 * THE DESTINATIONS ARE BUILT HERE AND NOWHERE ELSE, because a hand-built one
 * somewhere else is how a confirmed pass lands on a booking screen.
 */
describe("purchaseDestination", () => {
  it("sends a confirmed booking to the existing confirmation page", () => {
    // Act
    const href = purchaseDestination({ kind: "booking", id: UUID }, { gameId: OTHER });

    // Assert
    expect(href).toBe(`/game/${OTHER}/book/confirmation?booking=${UUID}`);
  });

  it("sends a confirmed pass to the credits page", () => {
    // Act
    const href = purchaseDestination({ kind: "pass", id: UUID }, { gameId: null });

    // Assert
    expect(href).toBe(`/pass/credits-added?topup=${UUID}`);
  });

  /*
   * A BOOKING WITH NO GAME IS NOT REACHABLE — `bookings.game_id` is NOT NULL.
   * It is here because the caller reads the game id off a row it fetched, and
   * a fetch that half-failed must not build `/game/null/...`.
   */
  it("refuses to build a booking destination without a game", () => {
    expect(purchaseDestination({ kind: "booking", id: UUID }, { gameId: null })).toBeNull();
  });
});

describe("the cookie name", () => {
  it("is namespaced so it cannot collide with Supabase's own", () => {
    expect(PENDING_PURCHASE_COOKIE.startsWith("hf_")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { destinationAfterAuth, resumeDestination } from "@/lib/auth/postAuth";

/**
 * These two functions are the reason the magic-link callback and the six-digit
 * code path cannot drift apart. Both call them; asserting them here asserts
 * both routes at once, without a session or a database.
 */
describe("resumeDestination", () => {
  it("prefers an explicit next over anything else", () => {
    expect(resumeDestination({ next: "/account", gameId: "g1", action: "book" })).toBe(
      "/account",
    );
  });

  it("sends a booking intent to the book page, carrying the resume marker", () => {
    expect(resumeDestination({ gameId: "g1", action: "book" })).toBe(
      "/game/g1/book?resume=book",
    );
  });

  it("sends a waitlist intent to the game page, where the join runs", () => {
    expect(resumeDestination({ gameId: "g1", action: "join_waitlist" })).toBe(
      "/game/g1?resume=join_waitlist",
    );
  });

  it("treats an unknown action on a game as a booking intent", () => {
    expect(resumeDestination({ gameId: "g1", action: "nonsense" })).toBe(
      "/game/g1/book?resume=book",
    );
  });

  it("falls back to the games list when there is no intent at all", () => {
    expect(resumeDestination({})).toBe("/games");
    expect(resumeDestination({ next: null, gameId: null, action: null })).toBe("/games");
  });
});

describe("destinationAfterAuth", () => {
  it("goes straight to the resume target for someone who already has a player row", () => {
    expect(destinationAfterAuth({ hasPlayer: true, resume: "/game/g1/book?resume=book" })).toBe(
      "/game/g1/book?resume=book",
    );
  });

  it("routes a session with no player row to signup, carrying the intent", () => {
    // Anywhere else would bounce them straight back: they have a session and
    // no nickname, so they are not a player yet.
    expect(destinationAfterAuth({ hasPlayer: false, resume: "/game/g1?resume=join_waitlist" })).toBe(
      "/signup?next=%2Fgame%2Fg1%3Fresume%3Djoin_waitlist",
    );
  });

  it("encodes the intent so its query string survives being a query value", () => {
    const target = destinationAfterAuth({ hasPlayer: false, resume: "/game/g1/book?resume=book" });
    const next = new URL(target, "https://example.test").searchParams.get("next");
    expect(next).toBe("/game/g1/book?resume=book");
  });
});

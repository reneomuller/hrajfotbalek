import { describe, expect, it } from "vitest";
import { decideShadowClaim, type ClaimCandidate } from "@/lib/auth/shadowClaim";

const AUTH_UID = "11111111-1111-1111-1111-111111111111";
const OTHER_UID = "22222222-2222-2222-2222-222222222222";

const shadowWithEmail: ClaimCandidate = {
  id: "player-shadow",
  email: "player@example.com",
  authUserId: null,
};

describe("shadowClaim", () => {
  it("claims a shadow player on an exact email match", () => {
    expect(
      decideShadowClaim({
        authEmail: "player@example.com",
        authUserId: AUTH_UID,
        candidates: [shadowWithEmail],
      }),
    ).toEqual({ action: "claim", playerId: "player-shadow" });
  });

  it("matches regardless of case, consistently with the lower(email) unique index", () => {
    expect(
      decideShadowClaim({
        authEmail: "PLAYER@Example.COM",
        authUserId: AUTH_UID,
        candidates: [shadowWithEmail],
      }),
    ).toEqual({ action: "claim", playerId: "player-shadow" });
  });

  it("ignores surrounding whitespace on the session email", () => {
    expect(
      decideShadowClaim({
        authEmail: "  player@example.com  ",
        authUserId: AUTH_UID,
        candidates: [shadowWithEmail],
      }),
    ).toEqual({ action: "claim", playerId: "player-shadow" });
  });

  // The rule that matters most: anything less than exact must NOT claim.
  it.each([
    ["a different address", "other@example.com"],
    ["a subaddress of the same mailbox", "player+tag@example.com"],
    ["the same local part on another domain", "player@example.org"],
    ["a prefix of the address", "player@example.co"],
  ])("does not claim on %s", (_label, authEmail) => {
    expect(
      decideShadowClaim({ authEmail, authUserId: AUTH_UID, candidates: [shadowWithEmail] }),
    ).toEqual({ action: "create" });
  });

  it("never auto-claims an email-less shadow — that is admin-merge only", () => {
    expect(
      decideShadowClaim({
        authEmail: "player@example.com",
        authUserId: AUTH_UID,
        candidates: [{ id: "player-noemail", email: null, authUserId: null }],
      }),
    ).toEqual({ action: "create" });
  });

  it("treats an empty-string email on the shadow as unclaimable too", () => {
    expect(
      decideShadowClaim({
        authEmail: "player@example.com",
        authUserId: AUTH_UID,
        candidates: [{ id: "player-blank", email: "   ", authUserId: null }],
      }),
    ).toEqual({ action: "create" });
  });

  it("never re-binds a row already owned by a different account", () => {
    expect(
      decideShadowClaim({
        authEmail: "player@example.com",
        authUserId: AUTH_UID,
        candidates: [{ id: "player-taken", email: "player@example.com", authUserId: OTHER_UID }],
      }),
    ).toEqual({ action: "create" });
  });

  it("reports already-linked when the row is bound to this account", () => {
    expect(
      decideShadowClaim({
        authEmail: "player@example.com",
        authUserId: AUTH_UID,
        candidates: [{ id: "player-mine", email: "player@example.com", authUserId: AUTH_UID }],
      }),
    ).toEqual({ action: "already-linked", playerId: "player-mine" });
  });

  it("prefers the already-linked row over a same-email shadow, creating no duplicate", () => {
    expect(
      decideShadowClaim({
        authEmail: "player@example.com",
        authUserId: AUTH_UID,
        candidates: [
          shadowWithEmail,
          { id: "player-mine", email: "player@example.com", authUserId: AUTH_UID },
        ],
      }),
    ).toEqual({ action: "already-linked", playerId: "player-mine" });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
    ["whitespace", "   "],
  ])("creates rather than claims when the session email is %s", (_label, authEmail) => {
    expect(
      decideShadowClaim({
        authEmail,
        authUserId: AUTH_UID,
        candidates: [shadowWithEmail],
      }),
    ).toEqual({ action: "create" });
  });

  it("creates when there are no candidates at all", () => {
    expect(
      decideShadowClaim({
        authEmail: "player@example.com",
        authUserId: AUTH_UID,
        candidates: [],
      }),
    ).toEqual({ action: "create" });
  });
});

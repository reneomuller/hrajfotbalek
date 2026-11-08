import { describe, expect, it } from "vitest";
import { isCountedPlayer } from "@/lib/admin/playerScope";

/**
 * Who counts as a player in the admin's numbers (round 42). The owner: "don't
 * count shadow accounts that we regularly use for booking games and other
 * stuff." The dashboard counted signed-up accounts while the players page
 * listed every row, so the two disagreed about how many players there are.
 */
const signedUp = { auth_user_id: "a1", deleted_at: null, is_seed: false };

describe("isCountedPlayer", () => {
  it("counts a signed-up account", () => {
    expect(isCountedPlayer(signedUp)).toBe(true);
  });

  it("does not count a shadow account — a name the admin books, with no login", () => {
    expect(isCountedPlayer({ ...signedUp, auth_user_id: null })).toBe(false);
  });

  it("does not count a deleted account", () => {
    expect(isCountedPlayer({ ...signedUp, deleted_at: "2026-10-20T10:00:00Z" })).toBe(false);
  });

  it("does not count a seed fixture", () => {
    expect(isCountedPlayer({ ...signedUp, is_seed: true })).toBe(false);
  });
});

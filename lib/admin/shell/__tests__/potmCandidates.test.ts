import { describe, expect, it } from "vitest";
import { potmCandidates } from "@/lib/admin/shell/potmCandidates";

/**
 * Who the Player of the Month picker offers (round 42, the admin rebuild).
 * The owner: "don't count shadow accounts that we regularly use for booking
 * games and other stuff." A shadow, a deleted account or a seed fixture is not
 * somebody to honour on the home page.
 */
function row(nickname: string, fields: Partial<{ auth: string | null; deleted: string | null; seed: boolean }> = {}) {
  return {
    id: `p-${nickname}`,
    nickname,
    auth_user_id: fields.auth === undefined ? `u-${nickname}` : fields.auth,
    deleted_at: fields.deleted ?? null,
    is_seed: fields.seed ?? false,
  };
}

const ROWS = [
  row("Anna"),
  row("Booked-by-admin", { auth: null }),
  row("Deleted player", { deleted: "2026-10-20T10:00:00Z" }),
  row("SeedBot", { seed: true }),
  row("Zdeněk"),
];

describe("potmCandidates", () => {
  it("offers players who count, and nobody else", () => {
    // Act
    const offered = potmCandidates(ROWS, null);

    // Assert
    expect(offered).toEqual([
      { id: "p-Anna", nickname: "Anna" },
      { id: "p-Zdeněk", nickname: "Zdeněk" },
    ]);
  });

  it("keeps the current pick even if it would not count, so saving does not clear it", () => {
    // Act
    const offered = potmCandidates(ROWS, "Booked-by-admin");

    // Assert
    expect(offered.map((p) => p.nickname)).toEqual(["Anna", "Booked-by-admin", "Zdeněk"]);
  });
});

import { describe, expect, it } from "vitest";
import { attentionLede, dashboardTiles, type TileFigures } from "@/lib/admin/shell/dashboardView";
import { strings } from "@/lib/strings";

/**
 * The dashboard's four tiles and the line under its title (round 42, the
 * admin rebuild). Each tile says what it counts, because "Total players"
 * meant something different on two pages.
 */
const FIGURES: TileFigures = {
  upcomingGames: 4,
  upcomingSeats: { taken: 21, capacity: 48 },
  totalPlayers: 37,
  newPlayers7d: 3,
  revenueMonthCzk: 12_340,
  window: {
    weekFrom: "2026-11-01T12:00:00.000Z",
    monthFrom: "2026-10-31T23:00:00.000Z",
    monthTo: "2026-11-30T23:00:00.000Z",
  },
};

function tile(testId: string) {
  const found = dashboardTiles(FIGURES).find((t) => t.testId === testId);
  if (!found) throw new Error(`no tile ${testId}`);
  return found;
}

describe("dashboardTiles", () => {
  it("keeps the four tiles, in order, each linked to its home", () => {
    // Act
    const tiles = dashboardTiles(FIGURES);

    // Assert
    expect(tiles.map((t) => [t.testId, t.href])).toEqual([
      ["tile-upcoming", "/admin/games"],
      ["tile-players", "/admin/players"],
      ["tile-new-players", "/admin/players"],
      ["tile-revenue", "/admin/stats"],
    ]);
  });

  it("says the player count is signed-up accounts only", () => {
    // Act
    const players = tile("tile-players");

    // Assert
    expect(players.value).toBe("37");
    expect(players.detail).toBe(strings.admin.shell.tilePlayersDetail);
  });

  it("says how full the upcoming board is", () => {
    // Act
    const upcoming = tile("tile-upcoming");

    // Assert
    expect(upcoming.value).toBe("4");
    expect(upcoming.detail).toBe("21 of 48 seats booked");
  });

  it("dates the seven days the new players are counted over", () => {
    // Act + Assert
    expect(tile("tile-new-players").detail).toBe("Since 1 Nov 2026");
  });

  it("names the revenue month in Prague time — 23:00Z on 31 October is November there", () => {
    // Act
    const revenue = tile("tile-revenue");

    // Assert
    expect(revenue.detail).toBe("Confirmed in November 2026");
  });

  it("prints revenue as formatCzk does, with the currency set apart so it fits a half tile", () => {
    // Act
    const revenue = tile("tile-revenue");

    // Assert
    expect(`${revenue.value} ${revenue.unit}`).toBe("12,340 CZK");
    expect(revenue.value).toBe("12,340");
  });

  it("gives the counts no unit", () => {
    // Act
    const counts = dashboardTiles(FIGURES).filter((t) => t.testId !== "tile-revenue");

    // Assert
    expect(counts.map((t) => t.unit)).toEqual([undefined, undefined, undefined]);
  });
});

describe("attentionLede", () => {
  it("says nothing needs the admin when the queue is empty", () => {
    expect(attentionLede(0)).toBe(strings.admin.shell.dashboardClear);
  });

  it("names one payment in the singular", () => {
    expect(attentionLede(1)).toBe(strings.admin.shell.dashboardAttentionOne);
  });

  it("counts several", () => {
    expect(attentionLede(3)).toBe(strings.admin.shell.dashboardAttentionMany.replace("{n}", "3"));
  });
});

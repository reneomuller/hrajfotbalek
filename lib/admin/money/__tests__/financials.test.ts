import { beforeEach, describe, expect, it, vi } from "vitest";
import { financialBounds, getFinancialsAt } from "@/lib/admin/financials";
import { strings } from "@/lib/strings";
import { fakeServiceClient, type Tables } from "./fakeServiceClient";

/**
 * The money page's period figures (round 42, the admin rebuild).
 *
 * ~~Months are UTC~~ — "a booking an hour either side of midnight on the 1st
 * lands in a different month under either rule, and no reader is counting".
 * The owner is: a game paid at half past midnight on the 1st, Prague time,
 * was this month's money and the page filed it under last month. Every
 * period here is a Prague calendar month, the same as the stats windows.
 */
const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/clients", () => ({
  createServiceRoleSupabaseClient: () => holder.client,
}));

/** 00:30 on 1 November in Prague (CET, UTC+1). */
const HALF_PAST_MIDNIGHT_NOV_1 = "2026-10-31T23:30:00.000Z";
const MID_NOVEMBER = "2026-11-15T12:00:00.000Z";
const MID_OCTOBER = "2026-10-15T12:00:00.000Z";

let tables: Tables;

beforeEach(() => {
  tables = { events: [], bookings: [], games: [], credit_ledger: [], players: [], credit_topups: [], checkout_sessions: [] };
  holder.client = fakeServiceClient(tables);
});

function paidBooking(id: string, paidAt: string, priceCzk = 180) {
  tables.bookings!.push({ id, game_id: "g1", price_czk: priceCzk, credit_applied_czk: 0, status: "confirmed", guest_count: 0 });
  tables.events!.push({ id: `ev-${id}`, event_type: "payment_confirmed", booking_id: id, created_at: paidAt });
}

describe("financialBounds", () => {
  it("puts 00:30 on the 1st, Prague time, in that month", () => {
    // Act
    const bounds = financialBounds("this_month", HALF_PAST_MIDNIGHT_NOV_1);

    // Assert — midnight in Prague, which is 23:00 UTC the evening before.
    expect(bounds).toEqual({ from: "2026-10-31T23:00:00.000Z", to: "2026-11-30T23:00:00.000Z" });
  });

  it("gives last month as the Prague month before, across the clock change", () => {
    // Act
    const bounds = financialBounds("last_month", MID_NOVEMBER);

    // Assert — October opens on summer time (UTC+2) and closes on winter time.
    expect(bounds).toEqual({ from: "2026-09-30T22:00:00.000Z", to: "2026-10-31T23:00:00.000Z" });
  });

  it("has no bounds for all time", () => {
    expect(financialBounds("all_time", MID_NOVEMBER)).toEqual({ from: null, to: null });
  });
});

describe("getFinancialsAt — revenue", () => {
  it("counts a payment at 00:30 on the 1st in the new month, not the old one", async () => {
    // Arrange
    paidBooking("b1", HALF_PAST_MIDNIGHT_NOV_1);

    // Act
    const november = await getFinancialsAt("this_month", MID_NOVEMBER);

    // Assert
    expect(november.revenueCzk).toBe(180);
    expect(november.previousRevenueCzk).toBe(0);
  });

  it("adds up every payment for all time, past the thousandth", async () => {
    // Arrange — one PostgREST response holds 1000 rows, and says nothing when
    // there were more.
    for (let i = 0; i < 1500; i += 1) {
      paidBooking(`b${i}`, new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString());
    }

    // Act
    const allTime = await getFinancialsAt("all_time", MID_NOVEMBER);

    // Assert
    expect(allTime.revenueCzk).toBe(1500 * 180);
  });

  it("compares last month against the month before it", async () => {
    // Arrange
    paidBooking("sep", "2026-09-20T12:00:00.000Z", 200);
    paidBooking("oct", MID_OCTOBER, 300);

    // Act
    const october = await getFinancialsAt("last_month", MID_NOVEMBER);

    // Assert
    expect(october.revenueCzk).toBe(300);
    expect(october.previousRevenueCzk).toBe(200);
  });
});

describe("getFinancialsAt — revenue by week", () => {
  it("puts 00:30 on the 8th, Prague time, in the second week", async () => {
    // Arrange — 22:30 UTC on 7 October is 00:30 on the 8th in Prague (UTC+2).
    paidBooking("b1", "2026-10-07T22:30:00.000Z");

    // Act
    const october = await getFinancialsAt("this_month", MID_OCTOBER);

    // Assert
    expect(october.weeks.map((w) => w.revenueCzk)).toEqual([0, 180, 0, 0, 0]);
  });

  it("keeps 23:30 on the 28th in the fourth week after the clocks go back", async () => {
    // Arrange — 22:30 UTC on 28 October is 23:30 on the 28th in Prague (UTC+1).
    paidBooking("b1", "2026-10-28T22:30:00.000Z");

    // Act
    const october = await getFinancialsAt("this_month", MID_OCTOBER);

    // Assert
    expect(october.weeks.map((w) => w.revenueCzk)).toEqual([0, 0, 0, 180, 0]);
  });

  it("draws four weeks for a 28-day February", async () => {
    // Arrange
    paidBooking("b1", "2026-02-27T12:00:00.000Z");

    // Act
    const february = await getFinancialsAt("this_month", "2026-02-10T12:00:00.000Z");

    // Assert
    expect(february.weeks.map((w) => w.label)).toEqual(["W1", "W2", "W3", "W4"]);
    expect(february.weeks[3]?.revenueCzk).toBe(180);
  });

  it("draws no chart for a month with nothing paid", async () => {
    // Act
    const quiet = await getFinancialsAt("this_month", MID_NOVEMBER);

    // Assert
    expect(quiet.weeks).toEqual([]);
  });
});

/*
 * REVENUE IS ALL THE MONEY THAT ARRIVED (the owner, 2026-11-08: "revenue
 * should count all the revenue including game pass … have it split so both
 * are visible"). It used to be game payments only, so a Game Pass sale never
 * appeared on the day it was paid. A booking paid from Credits adds nothing:
 * that money arrived when the Credits were bought.
 */
function passPurchase(id: string, at: string, czk: number, passGames: number | null = 5, status = "confirmed") {
  tables.credit_topups!.push({
    id,
    status,
    amount_czk: czk,
    received_amount_czk: status === "confirmed" ? czk : null,
    pass_games: passGames,
    confirmed_at: status === "confirmed" ? at : null,
  });
}

describe("getFinancialsAt — revenue is everything that arrived, split", () => {
  it("counts a Game Pass on the day it was paid, beside the games", async () => {
    // Arrange
    paidBooking("b1", MID_NOVEMBER);
    passPurchase("t1", MID_NOVEMBER, 840);

    // Act
    const f = await getFinancialsAt("this_month", MID_NOVEMBER);

    // Assert
    expect(f.revenueCzk).toBe(1020);
    expect(f.revenueSplit).toEqual({ gamesCzk: 180, passCzk: 840, topupCzk: 0 });
  });

  it("does not count a game paid from Credits a second time", async () => {
    // Arrange — the pass bought the Credits; the booking spends them.
    passPurchase("t1", MID_NOVEMBER, 840);
    tables.bookings!.push({ id: "b1", game_id: "g1", price_czk: 180, credit_applied_czk: 180, status: "confirmed", guest_count: 0 });

    // Act
    const f = await getFinancialsAt("this_month", MID_NOVEMBER);

    // Assert
    expect(f.revenueCzk).toBe(840);
  });

  it("keeps a Credit top-up that is not a pass as its own part", async () => {
    // Arrange
    passPurchase("t1", MID_NOVEMBER, 500, null);

    // Act
    const f = await getFinancialsAt("this_month", MID_NOVEMBER);

    // Assert
    expect(f.revenueSplit).toEqual({ gamesCzk: 0, passCzk: 0, topupCzk: 500 });
  });

  it("counts a card payment for a game that filled first as a game payment", async () => {
    // Arrange — the money arrived; the player got a Credit instead of a seat.
    tables.checkout_sessions!.push({ id: "cs1", status: "credited", amount_czk: 180, settled_at: MID_NOVEMBER });

    // Act
    const f = await getFinancialsAt("this_month", MID_NOVEMBER);

    // Assert
    expect(f.revenueSplit.gamesCzk).toBe(180);
  });

  it("does not count a pass purchase that was never paid", async () => {
    // Arrange
    passPurchase("t1", MID_NOVEMBER, 840, 5, "pending");
    passPurchase("t2", MID_NOVEMBER, 840, 5, "cancelled");

    // Act
    const f = await getFinancialsAt("this_month", MID_NOVEMBER);

    // Assert
    expect(f.revenueCzk).toBe(0);
  });

  it("compares with the month before on the same definition, and draws the pass in its week", async () => {
    // Arrange
    passPurchase("t0", MID_OCTOBER, 840);
    passPurchase("t1", MID_NOVEMBER, 1296, 8);

    // Act
    const f = await getFinancialsAt("this_month", MID_NOVEMBER);

    // Assert
    expect(f.previousRevenueCzk).toBe(840);
    expect(f.weeks.reduce((sum, week) => sum + week.revenueCzk, 0)).toBe(1296);
  });
});

/*
 * THE AVERAGE PER GAME WAS "VERY WRONG" (the owner, 2026-11-08), and this is
 * why: it divided EVERY payment that arrived in the month by the games SETTLED
 * in it. Everyone pays up front, so November's money included the four games
 * still ahead, all divided by the one game that had finished. It is now each
 * settled game's OWN revenue — the money panel's, pass seats at what the pass
 * cost — averaged over those games.
 */
describe("getFinancialsAt — the average per game", () => {
  function settledGame(id: string, startsAt: string) {
    tables.games!.push({ id, status: "settled", starts_at: startsAt });
  }

  it("counts a game that kicked off before the nightly sweep marked it played", async () => {
    // Arrange — production on 2026-11-08: #4 and #5 settled, #10 kicked off at
    // 17:00 and still "full". The owner: "we had more than two games … (3)".
    settledGame("g5", "2026-10-31T14:30:00.000Z");
    settledGame("g4", "2026-11-04T19:00:00.000Z");
    tables.games!.push({ id: "g10", status: "full", starts_at: "2026-11-08T16:00:00.000Z" });
    tables.games!.push({ id: "g13", status: "published", starts_at: "2026-11-11T19:00:00.000Z" });
    tables.games!.push({ id: "gx", status: "cancelled", starts_at: "2026-11-03T19:00:00.000Z" });

    // Act — the evening of the 8th.
    const allTime = await getFinancialsAt("all_time", "2026-11-08T21:30:00.000Z");

    // Assert — three played; the one ahead and the cancelled one are not.
    expect(allTime.gamesPlayed).toBe(3);
  });

  it("averages the settled games' own revenue, not money paid for games still ahead", async () => {
    // Arrange — one settled game that made 900; a week's upfront payments
    // for an upcoming one.
    settledGame("g1", "2026-11-05T17:00:00.000Z");
    tables.games!.push({ id: "g2", status: "published", starts_at: "2026-11-25T17:00:00.000Z" });
    for (let i = 0; i < 10; i += 1) paidBooking(`up${i}`, MID_NOVEMBER);
    holder.client = fakeServiceClient(tables, {
      game_economics: (args) =>
        (args.p_game_ids as string[]).map((id) => ({ game_id: id, revenue_czk: id === "g1" ? 900 : 0 })),
    });

    // Act
    const f = await getFinancialsAt("this_month", MID_NOVEMBER, { economics: true });

    // Assert
    expect(f.gamesPlayed).toBe(1);
    expect(f.avgPerGameCzk).toBe(900);
  });

  it("is the mean over every settled game in the month", async () => {
    // Arrange
    settledGame("g1", "2026-11-05T17:00:00.000Z");
    settledGame("g2", "2026-11-12T17:00:00.000Z");
    settledGame("g0", "2026-10-29T17:00:00.000Z");
    const revenue: Record<string, number> = { g0: 5000, g1: 900, g2: 1500 };
    holder.client = fakeServiceClient(tables, {
      game_economics: (args) =>
        (args.p_game_ids as string[]).map((id) => ({ game_id: id, revenue_czk: revenue[id] ?? 0 })),
    });

    // Act
    const f = await getFinancialsAt("this_month", MID_NOVEMBER, { economics: true });

    // Assert
    expect(f.gamesPlayed).toBe(2);
    expect(f.avgPerGameCzk).toBe(1200);
  });

  it("says nothing rather than guess when a game's own revenue cannot be read", async () => {
    // Arrange
    settledGame("g1", "2026-11-05T17:00:00.000Z");
    paidBooking("b1", MID_NOVEMBER);

    // Act
    const f = await getFinancialsAt("this_month", MID_NOVEMBER);

    // Assert
    expect(f.gamesPlayed).toBe(1);
    expect(f.avgPerGameCzk).toBeNull();
  });
});

describe("getFinancialsAt — the recent Credit ledger", () => {
  it("names every reason in words, including a top-up and an expiry", async () => {
    // Arrange
    tables.players!.push({ id: "p1", nickname: "Artem" });
    tables.credit_ledger!.push(
      { id: "l1", player_id: "p1", delta_czk: 750, reason: "topup", created_at: "2026-11-02T10:00:00Z" },
      { id: "l2", player_id: "p1", delta_czk: -180, reason: "pass_expiry", created_at: "2026-11-01T10:00:00Z" },
    );

    // Act
    const f = await getFinancialsAt("this_month", MID_NOVEMBER);

    // Assert
    expect(f.transactions.map((t) => [t.who, t.what, t.amountCzk])).toEqual([
      ["Artem", strings.admin.money.ledgerReason.topup, 750],
      ["Artem", strings.admin.money.ledgerReason.pass_expiry, -180],
    ]);
  });
});

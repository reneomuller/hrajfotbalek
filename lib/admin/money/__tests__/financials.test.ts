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
  tables = { events: [], bookings: [], games: [], credit_ledger: [], players: [] };
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

describe("getFinancialsAt — outstanding", () => {
  it("counts an unpaid party of three as three unpaid spots", async () => {
    // Arrange
    tables.games!.push({ id: "g1", status: "published" });
    tables.bookings!.push({ id: "b1", game_id: "g1", status: "reserved", price_czk: 540, credit_applied_czk: 0, guest_count: 2 });

    // Act
    const f = await getFinancialsAt("this_month", MID_NOVEMBER);

    // Assert
    expect(f.outstandingCzk).toBe(540);
    expect(f.unpaidSpots).toBe(3);
  });

  it("owes nothing on a cancelled game", async () => {
    // Arrange
    tables.games!.push({ id: "g1", status: "cancelled" });
    tables.bookings!.push({ id: "b1", game_id: "g1", status: "reserved", price_czk: 180, credit_applied_czk: 0, guest_count: 0 });

    // Act
    const f = await getFinancialsAt("this_month", MID_NOVEMBER);

    // Assert
    expect(f.unpaidSpots).toBe(0);
    expect(f.outstandingCzk).toBe(0);
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

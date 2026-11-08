import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPeriodEconomics } from "@/lib/admin/money/periodEconomics";
import type { GameEconomicsRow } from "@/lib/types/database";
import { fakeServiceClient, type FakeServiceClient, type Tables } from "./fakeServiceClient";

/**
 * Which games the money page's profit table and revenue mix are about (round
 * 42, the admin rebuild): the games PLAYED in the period — kicked off inside
 * it and marked played or settled. A game still on sale has earned nothing
 * yet, and a cancelled one paid for no pitch.
 */
const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/clients", () => ({
  createServiceRoleSupabaseClient: () => holder.client,
}));

const NOVEMBER = { from: "2026-10-31T23:00:00.000Z", to: "2026-11-30T23:00:00.000Z" };

function economicsRow(gameId: string): GameEconomicsRow {
  return {
    game_id: gameId,
    price_czk: 180,
    capacity: 14,
    seats_taken: 8,
    house_guests: 0,
    unpaid_seats: 0,
    single_seats: 8,
    pass_seats: 0,
    credit_seats: 0,
    free_seats: 0,
    single_czk: 1440,
    pass_czk: 0,
    credit_czk: 0,
    kept_czk: 0,
    owed_czk: 0,
    revenue_czk: 1440,
    pitch_cost_czk: 1200,
    profit_czk: 240,
    break_even_seats: 7,
  };
}

/** Mid-November: the 4th and the 11th are behind, the 20th ahead. */
const NOW = Date.parse("2026-11-15T12:00:00.000Z");

let tables: Tables;
let client: FakeServiceClient;

beforeEach(() => {
  tables = {
    games: [
      { id: "played", status: "played", starts_at: "2026-11-04T18:00:00.000Z", venue: "Strahov", price_czk: 180 },
      { id: "settled", status: "settled", starts_at: "2026-11-11T18:00:00.000Z", venue: "Letná", price_czk: 180 },
      { id: "on-sale", status: "published", starts_at: "2026-11-20T18:00:00.000Z", venue: "Strahov", price_czk: 180 },
      { id: "called-off", status: "cancelled", starts_at: "2026-11-06T18:00:00.000Z", venue: "Strahov", price_czk: 180 },
      { id: "october", status: "settled", starts_at: "2026-10-31T22:30:00.000Z", venue: "Strahov", price_czk: 180 },
    ],
  };
  client = fakeServiceClient(tables, {
    game_economics: (args) => (args.p_game_ids as string[]).map(economicsRow),
    booking_seat_values: () => [],
  });
  holder.client = client;
});

describe("getPeriodEconomics", () => {
  it("includes the evening's game before the morning sweep marks it played", async () => {
    // Arrange — production's #10 on 2026-11-08: kicked off at 17:00, still "full".
    tables.games!.push({ id: "tonight", status: "full", starts_at: "2026-11-15T10:00:00.000Z", venue: "Strahov", price_czk: 180 });

    // Act
    const period = await getPeriodEconomics(NOVEMBER, NOW);

    // Assert
    expect(period.rows.map((row) => row.game.id)).toEqual(["tonight", "settled", "played"]);
  });

  it("is about the games played in the period, newest first", async () => {
    // Act
    const period = await getPeriodEconomics(NOVEMBER, NOW);

    // Assert
    expect(period.rows.map((row) => row.game.id)).toEqual(["settled", "played"]);
  });

  it("asks SQL for those games' economics and nothing else", async () => {
    // Act
    await getPeriodEconomics(NOVEMBER, NOW);

    // Assert
    expect(client.rpcCalls).toContainEqual({
      name: "game_economics",
      args: { p_game_ids: ["settled", "played"] },
    });
  });

  it("reads every played game for all time", async () => {
    // Act
    const period = await getPeriodEconomics({ from: null, to: null }, NOW);

    // Assert
    expect(period.rows.map((row) => row.game.id)).toEqual(["settled", "played", "october"]);
  });

  it("asks nothing of SQL for a period with no games played", async () => {
    // Arrange
    tables.games = [];

    // Act
    const period = await getPeriodEconomics(NOVEMBER, NOW);

    // Assert
    expect(period.rows).toEqual([]);
    expect(client.rpcCalls).toEqual([]);
  });
});

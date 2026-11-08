import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminStatsForRange } from "@/lib/stats/queries";
import type { StatRange } from "@/lib/stats/window";
import { fakeServiceClient, seatsTakenFrom, type Tables } from "./fakeServiceClient";

/**
 * The operations figures on `/admin/stats` (round 42, the admin rebuild) —
 * two of them were counting the wrong thing.
 *
 *   - FILL RATE counted booking ROWS. A booking with two guests is three
 *     seats, and house guests occupy seats without being rows at all — the
 *     same bug `countActiveBookings` had on the games list. The seat counter
 *     lives in SQL (`game_seats_taken_many`), and the page now asks it.
 *   - NEW VS RETURNING counted every `booking_created`, including the shadow
 *     accounts the owner books friends onto: "don't count shadow accounts".
 */
const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/clients", () => ({
  createServiceRoleSupabaseClient: () => holder.client,
}));

/** November 2026 in Prague: 1 Nov 00:00 CET is 31 Oct 23:00 UTC. */
const NOVEMBER: StatRange = {
  window: "month",
  from: "2026-10-31T23:00:00.000Z",
  to: "2026-11-30T23:00:00.000Z",
};

const IN_NOVEMBER = "2026-11-12T18:00:00.000Z";

function player(id: string, overrides: Record<string, unknown> = {}) {
  return { id, nickname: id, auth_user_id: `auth-${id}`, deleted_at: null, is_seed: false, ...overrides };
}

function bookingCreated(playerId: string, at: string) {
  return { id: `ev-${playerId}-${at}`, event_type: "booking_created", player_id: playerId, booking_id: null, created_at: at };
}

let tables: Tables;

beforeEach(() => {
  tables = { games: [], bookings: [], events: [], players: [] };
  holder.client = fakeServiceClient(tables, { game_seats_taken_many: seatsTakenFrom(tables) });
});

describe("fill rate", () => {
  it("counts a booking with two guests as three seats", async () => {
    // Arrange
    tables.games!.push({ id: "g1", capacity: 10, guest_count: 0, starts_at: IN_NOVEMBER, status: "played" });
    tables.bookings!.push({ id: "b1", game_id: "g1", status: "confirmed", guest_count: 2 });

    // Act
    const stats = await getAdminStatsForRange(NOVEMBER);

    // Assert
    expect(stats.fillRate).toEqual({ sold: 3, capacity: 10 });
  });

  it("counts the game's house guests as taken seats", async () => {
    // Arrange
    tables.games!.push({ id: "g1", capacity: 12, guest_count: 2, starts_at: IN_NOVEMBER, status: "played" });
    tables.bookings!.push({ id: "b1", game_id: "g1", status: "reserved", guest_count: 0 });

    // Act
    const stats = await getAdminStatsForRange(NOVEMBER);

    // Assert
    expect(stats.fillRate).toEqual({ sold: 3, capacity: 12 });
  });

  it("asks the SQL seat counter rather than re-deriving it", async () => {
    // Arrange
    tables.games!.push({ id: "g1", capacity: 10, guest_count: 0, starts_at: IN_NOVEMBER, status: "settled" });
    const client = fakeServiceClient(tables, { game_seats_taken_many: () => [{ game_id: "g1", seats_taken: 7 }] });
    holder.client = client;

    // Act
    const stats = await getAdminStatsForRange(NOVEMBER);

    // Assert
    expect(stats.fillRate.sold).toBe(7);
    expect(client.rpcCalls).toContainEqual({ name: "game_seats_taken_many", args: { p_game_ids: ["g1"] } });
  });
});

describe("new vs returning", () => {
  it("does not count a shadow account, a deleted account or a seed fixture", async () => {
    // Arrange
    tables.players!.push(
      player("real"),
      player("shadow", { auth_user_id: null }),
      player("gone", { deleted_at: "2026-10-01T10:00:00Z" }),
      player("seed", { is_seed: true }),
    );
    for (const id of ["real", "shadow", "gone", "seed"]) tables.events!.push(bookingCreated(id, IN_NOVEMBER));

    // Act
    const stats = await getAdminStatsForRange(NOVEMBER);

    // Assert
    expect(stats.newReturning).toEqual({ newPlayers: 1, returning: 0 });
  });

  it("reads a regular's whole history, however long it is", async () => {
    // Arrange — "busy" has booked 999 times before; "regular" once. Read in
    // one request, the history stops at the thousandth row and loses
    // regular's earlier booking, which made this month's look like a first.
    tables.players!.push(player("busy"), player("regular"));
    for (let i = 0; i < 998; i += 1) {
      tables.events!.push(bookingCreated("busy", new Date(Date.UTC(2025, 0, 1) + i * 3_600_000).toISOString()));
    }
    tables.events!.push(
      bookingCreated("busy", IN_NOVEMBER),
      bookingCreated("regular", "2026-11-13T18:00:00.000Z"),
      bookingCreated("regular", "2026-09-01T18:00:00.000Z"),
    );

    // Act
    const stats = await getAdminStatsForRange(NOVEMBER);

    // Assert
    expect(stats.newReturning).toEqual({ newPlayers: 0, returning: 2 });
  });

  it("calls only a newcomer's first booking in the window new", async () => {
    // Arrange
    tables.players!.push(player("fresh"));
    tables.events!.push(
      bookingCreated("fresh", "2026-11-20T18:00:00.000Z"),
      bookingCreated("fresh", "2026-11-05T18:00:00.000Z"),
    );

    // Act
    const stats = await getAdminStatsForRange(NOVEMBER);

    // Assert
    expect(stats.newReturning).toEqual({ newPlayers: 1, returning: 1 });
  });

  it("still calls a real player's second booking returning", async () => {
    // Arrange
    tables.players!.push(player("real"));
    tables.events!.push(
      bookingCreated("real", "2026-09-01T18:00:00.000Z"),
      bookingCreated("real", IN_NOVEMBER),
    );

    // Act
    const stats = await getAdminStatsForRange(NOVEMBER);

    // Assert
    expect(stats.newReturning).toEqual({ newPlayers: 0, returning: 1 });
  });
});

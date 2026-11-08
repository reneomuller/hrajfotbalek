import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCountedPlayer } from "@/lib/admin/playerScope";
import { memoryClient, type MemoryTables } from "./memoryPostgrest";

/**
 * The dashboard's numbers (round 42, the admin rebuild).
 *
 * THE BUG: "Total players" on the dashboard disagreed with the players page.
 * The dashboard counted every row with a login that was not deleted — which
 * still counted seed fixtures — while `lib/admin/playerScope.ts` is now the
 * one definition of a player. And "Revenue (month)" was a UTC month, so a
 * payment confirmed at half past midnight on the 1st, Prague time, landed in
 * the month before.
 *
 * These run `getAdminDashboard` against in-memory rows and assert what the
 * admin would have SEEN, not which filters were called.
 */
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  seats: new Map<string, number>(),
  pitchCosts: false,
  economicsCalls: [] as string[][],
}));

vi.mock("@/lib/supabase/clients", () => ({
  createServiceRoleSupabaseClient: () => memoryClient(state.tables as MemoryTables),
}));

vi.mock("@/lib/admin/queries", () => ({
  countSeatsTaken: async (ids: string[]) =>
    new Map(ids.map((id) => [id, state.seats.get(id) ?? 0])),
}));

vi.mock("@/lib/db/capabilities", () => ({
  appCapabilities: async () => ({ pitchCosts: state.pitchCosts }),
}));

vi.mock("@/lib/admin/economics", () => ({
  getGameEconomics: async (ids: string[]) => {
    state.economicsCalls.push(ids);
    return new Map(ids.map((id) => [id, { gameId: id, breakEvenSeats: 5 }]));
  },
}));

const { getAdminDashboard } = await import("@/lib/admin/dashboard");

const NOW = Date.parse("2026-11-08T12:00:00.000Z");

function player(
  nickname: string,
  fields: { auth?: string | null; deletedAt?: string | null; seed?: boolean; createdAt: string },
) {
  return {
    id: `p-${nickname}`,
    nickname,
    auth_user_id: fields.auth === undefined ? `u-${nickname}` : fields.auth,
    deleted_at: fields.deletedAt ?? null,
    is_seed: fields.seed ?? false,
    created_at: fields.createdAt,
    player_number: null,
  };
}

/** Two real players, one of them new — and one of each kind that is not a player. */
const PLAYERS = [
  player("Anna", { createdAt: "2026-11-06T09:00:00.000Z" }),
  player("Boris", { createdAt: "2026-09-01T09:00:00.000Z" }),
  player("Shadow", { auth: null, createdAt: "2026-11-07T09:00:00.000Z" }),
  player("Gone", { deletedAt: "2026-11-07T10:00:00.000Z", createdAt: "2026-11-05T09:00:00.000Z" }),
  player("SeedBot", { seed: true, createdAt: "2026-11-07T11:00:00.000Z" }),
];

function upcomingGame(n: number) {
  return {
    id: `g-${n}`,
    venue: `Pitch ${n}`,
    starts_at: new Date(NOW + n * 86_400_000).toISOString(),
    capacity: 12,
    status: "published",
    format: "6v6",
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.tables = { players: PLAYERS, games: [], events: [], bookings: [], game_organizer_contacts: [] };
  state.seats = new Map();
  state.pitchCosts = false;
  state.economicsCalls = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the dashboard's player counts", () => {
  it("counts players by the one definition — no shadows, deleted or seed rows", async () => {
    // Arrange
    const expected = PLAYERS.filter(isCountedPlayer).length;

    // Act
    const dashboard = await getAdminDashboard({ now: NOW });

    // Assert
    expect(dashboard.totalPlayers).toBe(expected);
    expect(dashboard.totalPlayers).toBe(2);
  });

  it("counts new players over the last seven days under the same rule", async () => {
    // Arrange — Shadow, Gone and SeedBot are all inside the week; only Anna is a player.

    // Act
    const dashboard = await getAdminDashboard({ now: NOW });

    // Assert
    expect(dashboard.newPlayers7d).toBe(1);
  });

  it("lists new sign-ups under the same rule, newest first", async () => {
    // Act
    const dashboard = await getAdminDashboard({ now: NOW });

    // Assert
    expect(dashboard.recentSignups.map((signup) => signup.nickname)).toEqual(["Anna", "Boris"]);
  });
});

describe("the dashboard's revenue this month", () => {
  it("is the Prague calendar month, not the UTC one", async () => {
    // Arrange — 23:30Z on 31 October is 00:30 on 1 November in Prague, and
    // 23:30Z on 30 November is already 1 December there.
    state.tables.events = [
      { event_type: "payment_confirmed", booking_id: "b-first-of-month", created_at: "2026-10-31T23:30:00.000Z" },
      { event_type: "payment_confirmed", booking_id: "b-october", created_at: "2026-10-31T22:30:00.000Z" },
      { event_type: "payment_confirmed", booking_id: "b-december", created_at: "2026-11-30T23:30:00.000Z" },
    ];
    state.tables.bookings = [
      { id: "b-first-of-month", price_czk: 200, credit_applied_czk: 0 },
      { id: "b-october", price_czk: 300, credit_applied_czk: 0 },
      { id: "b-december", price_czk: 400, credit_applied_czk: 0 },
    ];

    // Act
    const dashboard = await getAdminDashboard({ now: NOW });

    // Assert
    expect(dashboard.revenueMonthCzk).toBe(200);
    expect(dashboard.window.monthFrom).toBe("2026-10-31T23:00:00.000Z");
  });

  it("does not count what a booking paid from Credits", async () => {
    // Arrange
    state.tables.events = [
      { event_type: "payment_confirmed", booking_id: "b-party", created_at: "2026-11-03T18:00:00.000Z" },
    ];
    state.tables.bookings = [{ id: "b-party", price_czk: 500, credit_applied_czk: 200 }];

    // Act
    const dashboard = await getAdminDashboard({ now: NOW });

    // Assert
    expect(dashboard.revenueMonthCzk).toBe(300);
  });
});

describe("the dashboard's upcoming games", () => {
  it("sums seats over every upcoming game, not only the six it lists", async () => {
    // Arrange — seven upcoming games with three seats each, and one past game.
    state.tables.games = [
      ...Array.from({ length: 7 }, (_, i) => upcomingGame(i + 1)),
      { ...upcomingGame(0), id: "g-past", starts_at: "2026-11-01T18:00:00.000Z" },
    ];
    state.seats = new Map([...Array.from({ length: 7 }, (_, i) => [`g-${i + 1}`, 3] as const), ["g-past", 9]]);

    // Act
    const dashboard = await getAdminDashboard({ now: NOW });

    // Assert
    expect(dashboard.upcomingGames).toBe(7);
    expect(dashboard.rows).toHaveLength(6);
    expect(dashboard.upcomingSeats).toEqual({ taken: 21, capacity: 84 });
  });

  it("reads no economics before the pitch-cost migration — the SQL does not exist", async () => {
    // Arrange
    state.tables.games = [upcomingGame(1), upcomingGame(2)];

    // Act
    const dashboard = await getAdminDashboard({ now: NOW });

    // Assert
    expect(state.economicsCalls).toEqual([]);
    expect(dashboard.rows.map((row) => row.economics)).toEqual([null, null]);
  });

  it("gives each listed game its economics once pitch costs exist", async () => {
    // Arrange
    state.tables.games = [upcomingGame(1), upcomingGame(2)];
    state.pitchCosts = true;

    // Act
    const dashboard = await getAdminDashboard({ now: NOW });

    // Assert
    expect(state.economicsCalls).toEqual([["g-1", "g-2"]]);
    expect(dashboard.rows.map((row) => row.economics?.breakEvenSeats)).toEqual([5, 5]);
  });
});

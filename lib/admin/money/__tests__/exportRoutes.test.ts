import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as statsExport } from "@/app/admin/stats/export/route";
import { GET as transactionsExport } from "@/app/admin/stats/transactions/route";
import { DEFAULT_STAT_WINDOW } from "@/lib/stats/window";
import { fakeServiceClient, POSTGREST_MAX_ROWS, type Tables } from "./fakeServiceClient";

/**
 * The money page's two exports (round 42, the admin rebuild).
 *
 *   - THE TRANSACTIONS FILE READ "EVERYTHING" IN ONE REQUEST, and PostgREST
 *     answers no request with more than `max_rows` (1000) rows. Past the
 *     thousandth booking the file silently stopped, and past the thousandth
 *     player the names column went blank — a reconciliation file that looks
 *     complete and is not.
 *   - THE STATS FILE DEFAULTED TO A MONTH where the page defaults to a week,
 *     under a comment promising the two "can never be reporting different
 *     periods from the same query string".
 */
const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/clients", () => ({
  createServiceRoleSupabaseClient: () => holder.client,
}));
vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => ({ id: "admin" }) }));

let tables: Tables;

beforeEach(() => {
  tables = { bookings: [], credit_topups: [], players: [], games: [], events: [] };
  holder.client = fakeServiceClient(tables, { game_seats_taken_many: () => [] });
});

/** More bookings, by more distinct players, than one PostgREST response holds. */
function manyBookings(count: number) {
  tables.games!.push({ id: "g1", venue: "Strahov", starts_at: "2026-11-04T18:00:00.000Z" });
  for (let i = 0; i < count; i += 1) {
    const id = String(i).padStart(5, "0");
    tables.players!.push({ id: `p${id}`, nickname: `Player ${id}` });
    tables.bookings!.push({
      id: `b${id}`,
      player_id: `p${id}`,
      game_id: "g1",
      price_czk: 180,
      credit_applied_czk: 0,
      payment_method: "cash",
      status: "confirmed",
      created_at: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
    });
  }
}

function dataRows(csv: string): string[] {
  return csv.split("\r\n").slice(1).filter((line) => line.trim() !== "");
}

describe("/admin/stats/transactions", () => {
  it("exports every booking, not the first thousand", async () => {
    // Arrange
    const count = POSTGREST_MAX_ROWS + 500;
    manyBookings(count);

    // Act
    const csv = await (await transactionsExport()).text();

    // Assert
    expect(dataRows(csv)).toHaveLength(count);
  });

  it("names the player on every row, past the thousandth player", async () => {
    // Arrange — fewer bookings than one response holds, but more PLAYERS,
    // because the pass buyers are other people.
    manyBookings(POSTGREST_MAX_ROWS - 100);
    for (let i = 0; i < 600; i += 1) {
      const id = `t${String(i).padStart(5, "0")}`;
      tables.players!.push({ id, nickname: `Buyer ${id}` });
      tables.credit_topups!.push({
        id: `topup-${id}`,
        player_id: id,
        amount_czk: 750,
        received_amount_czk: 750,
        pass_games: 5,
        status: "confirmed",
        created_at: new Date(Date.UTC(2026, 10, 1) + i * 60_000).toISOString(),
      });
    }

    // Act
    const csv = await (await transactionsExport()).text();

    // Assert
    const unnamed = dataRows(csv).filter((row) => row.split(",")[1] === "");
    expect(unnamed).toHaveLength(0);
  });

  it("keeps the agreed columns, behind the BOM Excel needs", async () => {
    // Act — decoded keeping the BOM, which `Response.text()` would strip.
    const bytes = await (await transactionsExport()).arrayBuffer();
    const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);

    // Assert
    expect(csv.split("\r\n")[0]).toBe("﻿date,player,reference,amount_czk,method,status");
  });
});

describe("/admin/stats/export", () => {
  it("covers the page's default window when the link names none", async () => {
    // Act
    const response = await statsExport(new Request("http://localhost/admin/stats/export"));

    // Assert
    expect(response.headers.get("content-disposition")).toContain(`stats-${DEFAULT_STAT_WINDOW}-`);
  });

  it("covers the window the link names", async () => {
    // Act
    const response = await statsExport(new Request("http://localhost/admin/stats/export?window=month"));

    // Assert
    expect(response.headers.get("content-disposition")).toContain("stats-month-");
  });
});

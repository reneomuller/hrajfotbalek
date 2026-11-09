import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A GAME IS PLAYED AT THE FINAL WHISTLE (the owner, 2026-11-09: "a game from
 * 18:00-19:30 would dissapear from view at 19:30 and get marked as played
 * automatically"). Vercel Pro lets a cron run every few minutes, so this job
 * asks the existing sweep for games past their END, with no buffer — the daily
 * /api/cron/played keeps its two hours and its report of what could not settle.
 */
const calls = vi.hoisted(() => [] as { name: string; args: unknown }[]);
vi.mock("@/lib/supabase/clients", () => ({
  createServiceRoleSupabaseClient: () => ({
    rpc: async (name: string, args?: unknown) => {
      calls.push({ name, args });
      if (name === "app_capabilities") return { data: { playedSweep: true }, error: null };
      return { data: { advanced: 1, settled: 1, skipped: 0 }, error: null };
    },
  }),
}));

const SECRET = "test-cron-secret";
const original = process.env.CRON_SECRET;

beforeEach(() => {
  calls.length = 0;
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

const request = (headers: Record<string, string> = {}) =>
  new Request("https://www.hrajfotbal.com/api/cron/played-now", { headers });

describe("/api/cron/played-now", () => {
  it("marks games played the moment they end — no buffer", async () => {
    // Arrange
    const { GET } = await import("@/app/api/cron/played-now/route");

    // Act
    const response = await GET(request({ authorization: `Bearer ${SECRET}` }));

    // Assert
    expect(response.status).toBe(200);
    expect(calls).toContainEqual({ name: "advance_played_games", args: { p_buffer_minutes: 0 } });
  });

  it("does nothing for a caller without the cron secret", async () => {
    // Arrange
    const { GET } = await import("@/app/api/cron/played-now/route");

    // Act
    const response = await GET(request());

    // Assert
    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
  });
});

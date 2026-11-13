import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCapiEvent, capiConfig, GRAPH_VERSION, registrationEventId } from "@/lib/analytics/metaCapi";

describe("Meta Conversions API (dormant until configured)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("stays off while the pixel id or the token is missing", () => {
    // Arrange
    vi.stubEnv("META_PIXEL_ID", "123456789");
    vi.stubEnv("META_CAPI_TOKEN", "");

    // Act
    const config = capiConfig();

    // Assert
    expect(config).toBeNull();
  });

  it("builds a Purchase with the browser's event id and a hashed external id, never the raw player id", () => {
    // Arrange
    const input = {
      name: "Purchase" as const,
      eventId: "cs_live_abc",
      playerId: "7f1c2d34-0000-4000-8000-000000000001",
      sourceUrl: "https://www.hrajfotbal.com/pass/credits-added",
      ip: "203.0.113.9",
      userAgent: "Mozilla/5.0",
      fbp: "fb.1.1700000000.123",
      fbc: null,
      value: 1296,
      atSeconds: 1_731_400_000,
    };

    // Act
    const event = buildCapiEvent(input);

    // Assert
    expect(event).toMatchObject({ event_name: "Purchase", event_id: "cs_live_abc", event_time: 1_731_400_000, action_source: "website", custom_data: { value: 1296, currency: "CZK" } });
    expect(event.user_data.external_id).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(event)).not.toContain(input.playerId);
    expect(event.user_data).not.toHaveProperty("fbc");
  });

  it("calls a Marketing API version Meta still serves — the Conversions API follows that schedule", () => {
    // v21.0, the first draft's, had expired: Meta lists the Marketing API's
    // current version as v25.0 (released 2026-02-18), checked 2026-11-12.
    expect(GRAPH_VERSION).toBe("v25.0");
  });

  it("gives a registration one stable event id per player, matching the browser's sign_up push", () => {
    expect(registrationEventId("p-1")).toBe("signup_p-1");
  });
});

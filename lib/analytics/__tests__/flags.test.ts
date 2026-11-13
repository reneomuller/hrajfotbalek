import { afterEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_FLAGS, flagDestination, sharedGameId, withFlag } from "@/lib/analytics/gtm";

describe("one-time analytics flags (GTM v4)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("appends a flag before the hash, after any query", () => {
    expect(withFlag("/game/1/book/confirmation?booking=b1", "booked", "1")).toBe("/game/1/book/confirmation?booking=b1&booked=1");
    expect(withFlag("/account#profile", "logged_in", "email")).toBe("/account?logged_in=email#profile");
  });

  it("encodes the value so a cancellation's game~hours~refunded survives", () => {
    expect(withFlag("/my-games", ANALYTICS_FLAGS.cancelled, "g 1~18~1")).toBe("/my-games?cancelled=g%201~18~1");
  });

  it("leaves the path alone while no GTM container is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_GTM_ID", "");
    expect(flagDestination("/games", "booked", "1")).toBe("/games");
  });

  it("adds the flag once a container is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_GTM_ID", "GTM-ABCD123");
    expect(flagDestination("/games", "paid", "cs_test_1")).toBe("/games?paid=cs_test_1");
  });

  it("reads the game a share link points at", () => {
    expect(sharedGameId("https://www.hrajfotbal.com/game/14")).toBe("14");
    expect(sharedGameId("https://www.hrajfotbal.com/game/7d3c?x=1")).toBe("7d3c");
    expect(sharedGameId("https://www.hrajfotbal.com/games")).toBeNull();
  });
});

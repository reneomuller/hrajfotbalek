import { describe, expect, it } from "vitest";
import { gameEventSchema } from "@/lib/games/schemaOrg";
import { policy } from "@/lib/policy";
import type { Database } from "@/lib/types/database";

type GameRow = Database["public"]["Tables"]["games"]["Row"];

const game: GameRow = {
  id: "11111111-1111-1111-1111-111111111111",
  venue: "Prazacka",
  venue_id: "22222222-2222-2222-2222-222222222222",
  starts_at: "2026-08-01T17:00:00.000Z",
  capacity: 12,
  price_czk: 200,
  status: "published",
  format: "6v6",
  surface: "turf",
  notes: null,
  city: "Prague",
  brand: "hrajfotbal",
  created_at: "2026-07-01T09:00:00.000Z",
};

const base = {
  game,
  spotsLeft: 3,
  url: "https://hrajfotbal.com/game/11111111-1111-1111-1111-111111111111",
  venueName: "Prazacka",
  city: "Prague",
};

describe("gameEventSchema", () => {
  it("emits a SportsEvent with the canonical context", () => {
    const schema = gameEventSchema(base);
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("SportsEvent");
  });

  it("prices the offer in CZK regardless of anything else, because the QR is an SPD string", () => {
    const offers = gameEventSchema(base).offers as Record<string, unknown>;
    expect(offers.price).toBe(200);
    expect(offers.priceCurrency).toBe("CZK");
  });

  it("reports InStock while spots remain and SoldOut at zero", () => {
    const open = gameEventSchema(base).offers as Record<string, unknown>;
    const full = gameEventSchema({ ...base, spotsLeft: 0 }).offers as Record<string, unknown>;
    expect(open.availability).toBe("https://schema.org/InStock");
    expect(full.availability).toBe("https://schema.org/SoldOut");
  });

  it("derives endDate from the policy duration, since games has no ends_at column", () => {
    const schema = gameEventSchema(base);
    const start = new Date(schema.startDate as string).getTime();
    const end = new Date(schema.endDate as string).getTime();
    expect((end - start) / 60_000).toBe(policy.game.durationMinutes);
  });

  it("announces a cancelled game as cancelled — its link is still circulating", () => {
    const schema = gameEventSchema({ ...base, game: { ...game, status: "cancelled" } });
    expect(schema.eventStatus).toBe("https://schema.org/EventCancelled");
  });

  it("carries the capacity numbers the page renders", () => {
    const schema = gameEventSchema(base);
    expect(schema.maximumAttendeeCapacity).toBe(12);
    expect(schema.remainingAttendeeCapacity).toBe(3);
  });

  it("leads the name with the format when the organizer set one", () => {
    expect(gameEventSchema(base).name).toContain("6v6");
    expect(gameEventSchema({ ...base, game: { ...game, format: null } }).name).not.toContain(
      "6v6",
    );
  });

  it("survives JSON serialization with no undefined holes", () => {
    const serialized = JSON.stringify(gameEventSchema(base));
    expect(serialized).not.toContain("undefined");
    expect(JSON.parse(serialized)).toMatchObject({ "@type": "SportsEvent" });
  });
});

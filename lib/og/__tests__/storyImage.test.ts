import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { resolveStrings } from "@/lib/i18n/resolve";
import { STORY_SIZE, renderGameStory } from "@/lib/og/storyImage";
import { storyAvailability, storyFacts } from "@/lib/og/storyFacts";

/** The game's 9:16 story image (2026-11-06): "9:16 (1080x1920)". */
describe("renderGameStory", () => {
  it("draws a 1080×1920 image, photo or no photo", async () => {
    // Arrange
    const t = resolveStrings("cs");
    const props = {
      venueName: "SC Koráb",
      address: "Dubečská 9, Praha 10",
      startsAt: "2026-11-13T19:00:00Z",
      facts: storyFacts({ format: "7v7", durationMinutes: 90 }, t),
      availability: storyAvailability({ bookedCount: 8, capacity: 14 }, "cs", t),
      bookedCount: 8,
      capacity: 14,
      photoDataUri: null,
      locale: "cs" as const,
      t,
    };

    // Act
    const png = PNG.sync.read(Buffer.from(await renderGameStory(props).arrayBuffer()));

    // Assert
    expect({ width: png.width, height: png.height }).toEqual(STORY_SIZE);
    expect(STORY_SIZE).toEqual({ width: 1080, height: 1920 });
  });
});

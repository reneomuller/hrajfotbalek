import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CapacityBar } from "@/components/game/CapacityBar";

/**
 * A FULL GAME'S BAR STAYS RED (2026-11-02, the owner: "when a game is full,
 * the player count line turns gray. I'd like it to stay red, even when full").
 * The rung before full is already red, so a filling game used to go red, then
 * grey, at the moment it was most worth noticing.
 */
const segmentClasses = (html: string) =>
  [...html.matchAll(/<i class="([^"]*)"/g)].map((m) => m[1]!);

describe("CapacityBar", () => {
  it("keeps a full game's bar red, the colour of the rung before it", () => {
    // Arrange
    const capacity = 14;

    // Act
    const full = segmentClasses(renderToStaticMarkup(<CapacityBar bookedCount={capacity} capacity={capacity} />));

    // Assert
    expect(full).toHaveLength(capacity);
    for (const classes of full) {
      expect(classes).toContain("bg-danger");
      expect(classes).not.toContain("bg-muted");
    }
  });
});

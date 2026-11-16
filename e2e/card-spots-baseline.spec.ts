import { expect, test } from "@playwright/test";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * "x spots left" sits on the time's baseline (2026-11-16). The owner: "the
 * spots are a tiny bit higher than the numbers … i want the spots to match the
 * numbers, not the other way around". They were 0.34px apart in WebKit and
 * 0.11px in Chromium — two line boxes of different heights — and the wrapper
 * now builds the time's line box. Measured from the text nodes themselves.
 */
test("the spots figure stands on the same baseline as the kick-off time", async ({ page }) => {
  // Arrange
  const game = await createScratchGame({ hoursFromNow: 48, format: "6v6" });
  try {
    // Act
    await page.goto("/games", { waitUntil: "networkidle" });
    const card = page.locator(`[data-testid="game-row"][data-game-id="${game.id}"]`);
    await card.scrollIntoViewIfNeeded();
    const gap = await card.evaluate((el) => {
      const textBox = (root: Element) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n.textContent?.trim()) {
            const range = document.createRange();
            range.selectNodeContents(n);
            return range.getBoundingClientRect();
          }
        }
        throw new Error("no text");
      };
      const time = textBox(el.querySelector('[data-testid="card-when"]')!);
      const spots = textBox(el.querySelector('[data-testid="row-spots"]')!);
      return spots.bottom - time.bottom;
    });

    // Assert
    expect(Math.abs(gap), `the spots sit ${gap.toFixed(2)}px off the time's line`).toBeLessThan(0.05);
  } finally {
    await destroyScratchGame(game.id);
  }
});

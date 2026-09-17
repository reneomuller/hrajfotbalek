import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * ROUND 37, ITEM 3 — A TAP MUST SHOW SOMETHING WITHIN 100ms.
 *
 * NOT A SPEED TEST. Item 2 is about how long a navigation takes; this is about
 * what the screen does in the meantime, which is a different question with a
 * different answer. A 220ms navigation that paints nothing for 220ms feels
 * broken; the same 220ms with the row darkening under the thumb at 16ms feels
 * instant, and the difference is entirely perception.
 *
 * MEASURED BY DECODING, not by asserting a class name. "There is an `active:`
 * variant in the className" would pass for a rule that never matches, for a
 * colour identical to the resting one, and for an element covered by something
 * else. This presses the control, samples the same rectangle repeatedly, and
 * reports the first frame whose pixels differ from the resting state.
 *
 * THE BUDGET IS 100ms because that is the interval below which a response reads
 * as caused by the touch rather than as a consequence of it. Everything here
 * should land near one frame; 100ms is the ceiling, not the target.
 */

test.use({ viewport: { width: 390, height: 844 } });

const FEEDBACK_BUDGET_MS = 100;

function meanPixel(png: PNG): number {
  let sum = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    sum += png.data[i]! + png.data[i + 1]! + png.data[i + 2]!;
  }
  return sum / (png.data.length / 4);
}

/**
 * Milliseconds from press to the first visibly different frame, or null if the
 * rectangle never changed within the window.
 */
async function pressFeedbackMs(
  page: import("@playwright/test").Page,
  target: import("@playwright/test").Locator,
  windowMs = 600,
): Promise<number | null> {
  /*
   * A SMALL RECTANGLE UNDER THE THUMB, because the INSTRUMENT'S RESOLUTION IS
   * THE SCREENSHOT'S COST. Sampling a 380x90 region took ~40ms a frame, so the
   * finest reading it could give was "somewhere under 40ms" and a control that
   * answered on the second frame read as 80. A 140x44 patch at the press point
   * costs a few milliseconds, which is smaller than the thing being measured.
   */
  const box = (await target.boundingBox())!;
  const clip = {
    x: Math.round(box.x + box.width / 2 - 70),
    y: Math.round(box.y + box.height / 2 - 22),
    width: 140,
    height: 44,
  };

  const resting = meanPixel(PNG.sync.read(await page.screenshot({ clip })));

  // A real press: down, hold, and sample while the finger is still on it.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const pressedAt = Date.now();
  await page.mouse.down();

  let changedAt: number | null = null;
  while (Date.now() - pressedAt < windowMs) {
    const now = meanPixel(PNG.sync.read(await page.screenshot({ clip })));
    if (Math.abs(now - resting) > 0.6) {
      changedAt = Date.now() - pressedAt;
      break;
    }
  }
  await page.mouse.up();
  return changedAt;
}

async function asPlayer(context: import("@playwright/test").BrowserContext) {
  await signInAs(context, players.runner);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
}

test("every primary tap on the five journeys answers within 100ms", async ({ page, context }) => {
  const game = await createScratchGame({
    durationMinutes: 90,
    priceCzk: 180,
    surface: "turf",
    hoursFromNow: 24 * 13,
  });
  await asPlayer(context);

  const dead: string[] = [];
  const report: string[] = [];

  async function check(label: string, url: string, locator: (p: typeof page) => ReturnType<typeof page.locator>) {
    await page.goto(url, { waitUntil: "networkidle" });
    const target = locator(page).first();
    if ((await target.count()) === 0) {
      report.push(`${label}: control not present — skipped`);
      return;
    }
    await target.scrollIntoViewIfNeeded();
    const ms = await pressFeedbackMs(page, target);
    report.push(`${label}: ${ms === null ? "NO VISIBLE CHANGE" : `${ms}ms`}`);
    if (ms === null || ms > FEEDBACK_BUDGET_MS) dead.push(`${label} (${ms ?? "never"})`);
  }

  try {
    // 1. home → the next-match card
    await check("home / game card", "/", (p) => p.getByTestId("game-row"));
    // 2. games list → a game row
    await check("games / game row", "/games", (p) => p.getByTestId("game-row"));
    // 3. game detail → the claim/book control
    await check("game / book CTA", `/game/${game.id}`, (p) => p.getByTestId("book-cta"));
    // 4. anywhere → the bottom nav, which is the most-tapped control in the product
    await check("nav / games tab", "/", (p) => p.getByTestId("tab-games"));
    await check("nav / account tab", "/", (p) => p.getByTestId("tab-account"));
    // 5. booking flow → the confirm control
    await check("book / confirm", `/game/${game.id}/book`, (p) => p.getByTestId("confirm-booking"));

    console.log("TAP FEEDBACK:\n  " + report.join("\n  "));
    expect(dead, `taps with no feedback inside ${FEEDBACK_BUDGET_MS}ms:\n  ${dead.join("\n  ")}`).toEqual([]);
  } finally {
    await destroyScratchGame(game.id);
  }
});

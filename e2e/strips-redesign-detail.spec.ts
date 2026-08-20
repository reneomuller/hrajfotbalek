import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";

/**
 * REDESIGN v2, ROUND 4 — the game detail page.
 *
 * `docs/redesign-v2/strips/detail/`.
 *
 * R6(b) IS THE RULING THIS ROUND EXISTS FOR, and it is asserted numerically
 * rather than looked at. The ruling has three parts and each one is a distinct
 * way to get it wrong:
 *
 *   1. the photograph BACKS THE BAND — it is there at all, and it loaded;
 *   2. it is FULLY FADED before the band ends — the scrim's last stop is `ink`
 *      at full opacity, so the join with the page is invisible;
 *   3. the FIRST CONTENT BOX SITS ON THE FLAT SURFACE — no photograph behind
 *      it, which is what "above the first box" means.
 *
 * Part 3 is the one a screenshot cannot settle: a scrim ending at .95 looks
 * identical in a review and leaves a band of photograph under the card.
 *
 * NOTE A DELIBERATE DIVERGENCE FROM THE FRAME. `p03` draws the header band
 * flat black — no photograph at all. R6(b) is the owner's ruling and postdates
 * it, so the photo ships and the frame loses. Recorded here rather than
 * resolved silently, because the next session comparing page to frame will see
 * it immediately and should find the reason next to the code.
 */

const OUT = path.resolve(process.cwd(), "docs/redesign-v2/strips/detail");

test.use({ viewport: { width: 390, height: 844 } });

async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });
}

test("the header band carries the pitch and fades out above the first box", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  const game = await createScratchGame({ capacity: 12, hoursFromNow: 48 });

  try {
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await settle(page);

    const hero = page.getByTestId("game-hero");
    await expect(hero).toBeVisible();

    // --- 1. the photograph is there, and it LOADED --------------------------
    // A 404 renders an <img> of the right size that photographs as a dark
    // band, which is indistinguishable from the frame's flat black.
    const photo = hero.getByTestId("hero-photo");
    await expect(photo).toBeAttached();
    expect(
      await photo.evaluate((el) => (el as HTMLImageElement).naturalWidth),
      "the pitch photo did not load",
    ).toBeGreaterThan(0);

    // Full-bleed: the band cancels the page gutter, or the photo sits in a box.
    const bleed = await hero.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: window.innerWidth - r.right, height: r.height };
    });
    expect(bleed.left).toBeLessThanOrEqual(1);
    expect(bleed.right).toBeLessThanOrEqual(1);

    // --- 2. the scrim ends at OPAQUE ink ------------------------------------
    // Not "nearly opaque". The final stop is the page's own background, which
    // is the only value that makes the join invisible; anything short of it
    // leaves a visible seam of photograph along the top of the first card.
    const scrim = await hero
      .getByTestId("hero-scrim")
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(scrim, "the scrim is not a vertical gradient").toContain("linear-gradient");
    // `ink` is #080808 -> rgb(8, 8, 8) with no alpha component: an opaque stop.
    expect(scrim, "the scrim never reaches opaque ink").toContain("rgb(8, 8, 8)");

    // --- 3. the first content box sits BELOW the band -----------------------
    // Which is the geometric form of "the box sits on the normal flat
    // surface": if the box overlaps the band at all, part of it is over the
    // photograph.
    const geom = await page.evaluate(() => {
      const band = document
        .querySelector('[data-testid="game-hero"]')!
        .getBoundingClientRect();
      const box = document
        .querySelector('[data-testid="game-info-card"]')!
        .getBoundingClientRect();
      return { bandBottom: band.bottom, boxTop: box.top };
    });
    expect(
      geom.boxTop,
      "the first content box overlaps the photographed band",
    ).toBeGreaterThanOrEqual(geom.bandBottom - 1);

    await hero.screenshot({ path: path.join(OUT, "01-header-band.png") });
    await page.screenshot({ path: path.join(OUT, "02-fold.png") });
  } finally {
    await destroyScratchGame(game.id);
  }
});

/**
 * BACK AND TITLE ON ONE ROW, and the title at the frames' step.
 *
 * The v1.2 header spent a whole row on a 44px circle and put the venue name
 * under it. p03 puts them side by side, which is most of where the band's
 * height went.
 */
test("the back control and the venue title share a row", async ({ page, context }) => {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  const game = await createScratchGame({ hoursFromNow: 30 });

  try {
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await settle(page);

    const rows = await page.evaluate(() => {
      const back = document.querySelector('[data-testid="game-back"]')!.getBoundingClientRect();
      const title = document
        .querySelector('[data-testid="game-hero"] h1')!
        .getBoundingClientRect();
      return {
        overlap: Math.min(back.bottom, title.bottom) - Math.max(back.top, title.top),
        titleLeft: title.left,
        backRight: back.right,
        size: parseFloat(
          getComputedStyle(document.querySelector('[data-testid="game-hero"] h1')!).fontSize,
        ),
      };
    });

    // They share vertical space rather than stacking…
    expect(rows.overlap, "back and title are stacked, not on one row").toBeGreaterThan(0);
    // …and the title is to the RIGHT of the back control, not over it.
    expect(rows.titleLeft).toBeGreaterThanOrEqual(rows.backRight - 1);
    // `page-title`, ~~the 32px step~~ the 27px step p03 draws: its cap is
    // 23.5px and Anton renders 0.86 of its em, not the published 0.73 (R28).
    expect(rows.size).toBeCloseTo(27.3, 0);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/**
 * THE DISPLAY NUMERALS ARE ANTON (R5), AND ONLY THE DISPLAY ONES.
 *
 * R5's widening names two cases exactly — hero money figures and large
 * spots-left counters — and forbids the face on body-size figures. Both sides
 * are asserted, because the drift this guards against goes both ways: an
 * unconverted counter, and a list card that "matches" it.
 */
test("the counter and the price are Anton; the list figure is not", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  const game = await createScratchGame({ capacity: 12, priceCzk: 150, hoursFromNow: 48 });

  try {
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await settle(page);

    const faces = await page.evaluate(() => {
      const read = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const s = getComputedStyle(el);
        return { family: s.fontFamily, size: parseFloat(s.fontSize) };
      };
      return {
        counter: read('[data-testid="availability-card"] [data-testid="spots-left"]'),
        price: read('[data-testid="claim-bar-price"]'),
      };
    });

    expect(faces.counter!.family, "the availability counter is not Anton").toContain("Anton");
    expect(faces.counter!.size).toBeGreaterThanOrEqual(36);
    expect(faces.price!.family, "the claim bar price is not Anton").toContain("Anton");

    await page.getByTestId("availability-card").screenshot({
      path: path.join(OUT, "03-availability.png"),
    });
    await page.getByTestId("claim-bar").screenshot({ path: path.join(OUT, "04-claim-bar.png") });

    // The LIST figure stays on the body face — R5's forbidden half.
    await page.goto("/games", { waitUntil: "networkidle" });
    await settle(page);
    const rowFigure = await page
      .getByTestId("game-row")
      .first()
      .getByTestId("spots-left")
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(rowFigure, "Anton leaked onto the list card's body-size figure").not.toContain(
      "Anton",
    );
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("the detail in three languages", async ({ page, context }) => {
  mkdirSync(OUT, { recursive: true });
  const game = await createScratchGame({ capacity: 12, hoursFromNow: 48 });

  try {
    for (const locale of ["en", "cs", "ru"] as const) {
      await context.clearCookies();
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
      ]);
      await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
      await settle(page);
      await page.screenshot({
        path: path.join(OUT, `05-detail-${locale}.png`),
        fullPage: true,
      });
    }
  } finally {
    await destroyScratchGame(game.id);
  }
});

import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";

/**
 * REDESIGN v2, ROUND 3 — home and games, composed from round 2's card.
 *
 * `docs/redesign-v2/strips/pages/`.
 *
 * WHAT THIS ROUND ACTUALLY CHANGED, and therefore what is asserted here rather
 * than only photographed:
 *
 *   - the hero is the SLOGAN (`p01`), in two rows, translated (round 13);
 *   - `how-it-works` is ONE divided panel, not three cards;
 *   - the three home panels wear the frames' NEUTRAL edge, not a volt one;
 *   - page headings are `page-title`, the 27px step `p02` draws (R28);
 *   - the nav bar's cells are inset while the band stays flush (R12).
 *
 * THREE LANGUAGES ON THE HERO, because it is the surface where the type system
 * has a language-dependent failure: Anton ships no Cyrillic, so Russian
 * display copy falls back to the body face and sets far wider. The row COUNT
 * therefore differs by language and is not the thing to assert — `home.spec.ts`
 * asserts the break rule instead. These strips are the visual record of what
 * that produces.
 */

const OUT = path.resolve(process.cwd(), "docs/redesign-v2/strips/pages");

test.use({ viewport: { width: 390, height: 844 } });

async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });
}

test("home and games, in three languages", async ({ page, context }) => {
  mkdirSync(OUT, { recursive: true });

  for (const locale of ["en", "cs", "ru"] as const) {
    await context.clearCookies();
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
    ]);

    await page.goto("/", { waitUntil: "networkidle" });
    await settle(page);
    await page.screenshot({ path: path.join(OUT, `01-home-${locale}.png`), fullPage: true });

    await page.goto("/games", { waitUntil: "networkidle" });
    await settle(page);
    await page.screenshot({ path: path.join(OUT, `02-games-${locale}.png`), fullPage: true });
  }
});

test("the hero is the slogan and the CTA is a capsule", async ({ page, context }) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  await page.goto("/", { waitUntil: "networkidle" });
  await settle(page);

  const headline = page.getByTestId("hero-headline");
  await expect(headline).toBeVisible();

  // ~~The wordmark is the HEADER's job.~~ ~~Round 12: the hero carries the
  // name, untranslated.~~ Round 13 reversed that: the hero is the SLOGAN and
  // it translates, and the header keeps the mark alone. The per-language
  // assertion lives in `home.spec.ts`; here it is enough that the brand name
  // is not the largest type on the page.
  expect((await headline.innerText()).toUpperCase()).not.toContain("HRAJ FOTBAL");

  // THE CTA IS A CAPSULE, not a 14px rounded rectangle (p01). Compared against
  // its own height rather than to a literal, so the assertion survives a
  // padding change: `pill` is 999px and clamps to half the short side.
  const cta = page.locator('a[href="/games"]').first();
  const capsule = await cta.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { radius: parseFloat(getComputedStyle(el).borderTopLeftRadius), h: r.height };
  });
  expect(capsule.radius).toBeCloseTo(capsule.h / 2, 0);

  await page.locator("section").first().screenshot({ path: path.join(OUT, "03-hero.png") });
});

/**
 * THE THREE PANELS WEAR THE NEUTRAL EDGE (p01).
 *
 * Sampled off the frame, a panel's border is rgb(39,40,32) on a rgb(21,22,13)
 * fill — `hairline-strong` on `surface-raised`, which is `.lifted`. All three
 * had drifted to a volt border on `surface`, each spelled its own way.
 *
 * ASSERTED AS "NOT VOLT" RATHER THAN AS AN RGB TRIPLE. The defect is spending
 * the accent on furniture; the exact grey is `.lifted`'s business and moves
 * with the token.
 */
test("the home panels use the neutral edge, not the accent", async ({ page, context }) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  await page.goto("/", { waitUntil: "networkidle" });
  await settle(page);

  for (const id of ["community-panel", "potm-panel", "faq-panel", "how-it-works"]) {
    const panel = page.getByTestId(id);
    await expect(panel, id).toBeVisible();
    const edge = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      const [r, g, b] = s.borderTopColor.match(/\d+/g)!.map(Number) as [
        number,
        number,
        number,
      ];
      return { r, g, b, width: s.borderTopWidth };
    });
    // Volt is #C8FF00 — green far above red and blue near zero. Any hairline
    // grey has the three channels within a few points of each other.
    const voltish = edge.g > edge.r + 20 && edge.g > edge.b + 60;
    expect(voltish, `${id} still has a volt edge`).toBe(false);
    expect(edge.width, `${id} lost its edge entirely`).not.toBe("0px");
  }

  await page.getByTestId("community-panel").screenshot({
    path: path.join(OUT, "04-community.png"),
  });
  await page.getByTestId("potm-panel").screenshot({ path: path.join(OUT, "05-potm.png") });
});

/**
 * HOW IT WORKS IS ONE ORDERED LIST, NOT THREE CARDS.
 *
 * The sequence is the content — 01 → 02 → 03 — and three adjacent boxes do not
 * say so. Asserted structurally rather than visually because the visual
 * difference (three edges become two rules) is the kind a screenshot review
 * waves through.
 */
test("how it works is one ordered list of three divided rows", async ({ page, context }) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  await page.goto("/", { waitUntil: "networkidle" });
  await settle(page);

  const steps = page.getByTestId("how-it-works");
  await expect(steps).toHaveJSProperty("tagName", "OL");
  await expect(steps.locator("> li")).toHaveCount(3);

  // The last row carries no rule, or the panel ends on a line across nothing.
  const lastRule = await steps
    .locator("> li")
    .last()
    .evaluate((el) => getComputedStyle(el).borderBottomWidth);
  expect(lastRule).toBe("0px");

  await steps.screenshot({ path: path.join(OUT, "06-how-it-works.png") });
});

/**
 * THE PAGE HEADING IS THE FRAMES' STEP.
 *
 * `p02` sets `UPCOMING GAMES` at a **23.5px Anton cap height**. That cap is
 * the frame's fact and it has never changed; what changed in round 12 is the
 * arithmetic that turns it into an em.
 *
 * ~~which is a 32px em~~ — only if Anton's cap ratio is its PUBLISHED 0.73.
 * The ratio it RENDERS at is 0.86, so the frame's cap is a 27px em and this
 * heading shipped a fifth too large for nine rounds (R28).
 *
 * ASSERTED AS A COMPUTED SIZE at 390, because that is the width the frames are
 * drawn at and because the failure mode is silent either way — a heading at
 * the wrong step is still a perfectly good heading.
 */
test("the games and home headings are set at the frames' size", async ({ page, context }) => {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);

  for (const [where, url, selector] of [
    ["games", "/games", "h1"],
    ["home", "/", "h2"],
  ] as const) {
    await page.goto(url, { waitUntil: "networkidle" });
    await settle(page);
    const size = await page
      .locator(selector)
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    // `clamp(27px,7vw,36px)` at 390 → 27.3px → a 23.5px cap, which is p02's.
    expect(size, `${where} heading size`).toBeCloseTo(27.3, 0);
  }
});

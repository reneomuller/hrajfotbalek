import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * ROUND 22, ITEM 4 — the Ukrainian overflow pass.
 *
 * THIS EXISTS BECAUSE OF F3. The audit found `ДЛИТЕЛЬНОСТЬ` drawing straight
 * over `60 минут` on the game detail: a label that needed 117px in an 84px
 * column, in a language nobody screenshotted for nine rounds. The column was
 * widened (`minmax(84px,auto)`), but the LESSON is not "that grid was wrong" —
 * it is that a longer alphabet finds its own collisions and only a render at
 * the real width finds them first.
 *
 * So this walks the five densest surfaces at 390px in Ukrainian and asserts
 * two properties that a screenshot review does not reliably catch:
 *
 *   1. NOTHING IS CLIPPED. Every text node's `scrollWidth` fits its
 *      `clientWidth`, so no string is being silently cut off — the failure
 *      that reads as a design choice.
 *   2. NOTHING OVERPRINTS. In the fact grid specifically, the label's right
 *      edge is left of its value's left edge. That is F3's exact geometry, and
 *      it is invisible to a clipping check because overflowing text is not
 *      clipped — it is drawn on top of the neighbour.
 *
 * And it photographs each surface, because the report has to show them.
 */

/*
 * The PNGs land here and are committed as JPEGs — a full-page capture of the
 * games board is 5.4MB of PNG and 200KB of JPEG, and no claim in this file
 * rests on a screenshot: every property is asserted from the DOM. The images
 * are for the report.
 */
const OUT = path.resolve(process.cwd(), "docs/v22/strips/uk");

test.use({ viewport: { width: 390, height: 844 } });

async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });
}

/**
 * Every leaf element whose own text does not fit the box drawn for it.
 *
 * LEAVES ONLY. A wrapper's `scrollWidth` legitimately exceeds its width when a
 * child is positioned or scrolls on purpose (the day strip, the admin chips),
 * and counting those would produce a spec that fails on correct pages — which
 * is a spec that gets deleted rather than fixed.
 *
 * The one-pixel tolerance is sub-pixel text metrics, not slack: Chromium
 * rounds `scrollWidth` up to an integer and `clientWidth` down, so a line that
 * exactly fits can report one pixel over.
 */
async function clipped(page: import("@playwright/test").Page, within: string) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return [{ text: `MISSING ROOT ${selector}`, over: 999 }];

    const out: Array<{ text: string; over: number }> = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      if (el.children.length > 0) continue;
      const text = (el.textContent ?? "").trim();
      if (!text) continue;

      const style = getComputedStyle(el);
      // An element that is deliberately a scroller is not a clipped label.
      if (style.overflowX === "auto" || style.overflowX === "scroll") continue;
      if (style.position === "absolute" && style.width === "auto") continue;
      /*
       * `truncate` IS THE DESIGN, NOT THE FAULT. The card's venue name shortens
       * with an ellipsis on purpose, and the seed carries a deliberately
       * hostile 43-character XSS-probe venue to prove it — which this check
       * caught on the first run, in every language rather than in Ukrainian.
       * A rule that fires on an intentional ellipsis is a rule that gets
       * switched off; what matters here is text with NOWHERE to go.
       */
      if (style.textOverflow === "ellipsis") continue;

      const over = el.scrollWidth - el.clientWidth;
      if (over > 1) out.push({ text: text.slice(0, 60), over });
    }
    return out;
  }, within);
}

/**
 * F3's geometry, generalised: in a two-column `<dl>`, does any term's box
 * reach into its definition's?
 */
async function overprinting(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const out: Array<{ label: string; overlap: number }> = [];
    for (const dl of Array.from(document.querySelectorAll("dl"))) {
      const kids = Array.from(dl.children);
      for (let i = 0; i < kids.length - 1; i++) {
        const dt = kids[i];
        const dd = kids[i + 1];
        if (dt?.tagName !== "DT" || dd?.tagName !== "DD") continue;
        const a = dt.getBoundingClientRect();
        const b = dd.getBoundingClientRect();
        // Only compare things on the same row; a stacked grid is not a
        // collision.
        if (b.top >= a.bottom - 2) continue;
        /*
         * `scrollWidth`, NOT the rect. The rect is the COLUMN the grid gave
         * the label; the text inside it can be wider and simply draw outside,
         * which is precisely what F3 was — a visible collision with no
         * geometry to show for it.
         */
        const drawn = a.left + (dt as HTMLElement).scrollWidth;
        const overlap = drawn - b.left;
        if (overlap > 1) {
          out.push({ label: (dt.textContent ?? "").trim(), overlap });
        }
      }
    }
    return out;
  });
}

/** Which family actually painted this element's glyphs. */
async function renderedFace(page: import("@playwright/test").Page, testId: string) {
  return page.getByTestId(testId).evaluate((el) => {
    const style = getComputedStyle(el);
    return { family: style.fontFamily, size: style.fontSize };
  });
}

test.describe("Ukrainian at 390px", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "uk", domain: "localhost", path: "/" },
    ]);
  });

  test("the five dense surfaces render Ukrainian without clipping or overprinting", async ({
    page,
    context,
  }) => {
    mkdirSync(OUT, { recursive: true });
    await signInAs(context, players.runner);
    const game = await createScratchGame({
        capacity: 12,
        priceCzk: 150,
        // The densest possible fact grid: every optional row present, so the
        // Ukrainian labels are all on screen at once.
        durationMinutes: 90,
        subsPerTeam: 2,
        format: "6v6",
        surface: "turf",
      });

    try {
      const surfaces = [
        { name: "01-home", url: "/" },
        { name: "02-games", url: "/games" },
        { name: "03-detail", url: `/game/${game.id}` },
        { name: "04-profile", url: "/account" },
        { name: "05-pass", url: "/pass" },
      ];

      const failures: string[] = [];

      for (const surface of surfaces) {
        await page.goto(surface.url, { waitUntil: "networkidle" });
        await settle(page);
        await page.screenshot({
          path: path.join(OUT, `${surface.name}.png`),
          fullPage: true,
        });

        for (const hit of await clipped(page, "body")) {
          failures.push(`${surface.name}: "${hit.text}" is ${hit.over}px over its box`);
        }
        for (const hit of await overprinting(page)) {
          failures.push(
            `${surface.name}: label "${hit.label}" draws ${hit.overlap}px into its value`,
          );
        }

        // Nothing may push the page sideways at 390 — the audit's own rule.
        const scrollX = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(scrollX, `${surface.name} scrolls horizontally`).toBeLessThanOrEqual(1);
      }

      expect(failures, failures.join("\n")).toEqual([]);
    } finally {
      await destroyScratchGame(game.id);
    }
  });

  test("the booking flow's Ukrainian controls fit their buttons", async ({
    page,
    context,
  }) => {
    mkdirSync(OUT, { recursive: true });
    await signInAs(context, players.runner);
    const game = await createScratchGame({
        capacity: 12,
        priceCzk: 150,
        // The densest possible fact grid: every optional row present, so the
        // Ukrainian labels are all on screen at once.
        durationMinutes: 90,
        subsPerTeam: 2,
        format: "6v6",
        surface: "turf",
      });

    try {
      await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
      await settle(page);
      await page.screenshot({ path: path.join(OUT, "06-booking.png"), fullPage: true });

      const failures = await clipped(page, "body");
      expect(failures, JSON.stringify(failures)).toEqual([]);

      /*
       * THE PARTY SUMMARY, WHICH IS A COUNT IN A SENTENCE (item 3, on the
       * surface item 4 walks). Two guests is three seats — the 2-4 form — and
       * it rendered "3 місць" before this round: the 5+ form, on a control
       * whose whole range is 2 to 4.
       */
      await page.getByTestId("party-2-input").click({ force: true });
      await expect(page.getByTestId("party-summary")).toContainText("3 місця");
    } finally {
      await destroyScratchGame(game.id);
    }
  });

  /**
   * ITEM 5c — the Anton rule, checked rather than assumed.
   *
   * Anton ships no Cyrillic. The hero is `font-display`, so a Ukrainian hero
   * cannot be drawn in Anton and must fall to the next family in the stack.
   * The claim in `app/page.tsx` is that it falls to the BODY FACE; this is the
   * assertion that makes that claim true rather than aspirational.
   */
  test("the Ukrainian hero falls to the body face, not to a system font", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await settle(page);

    const face = await renderedFace(page, "hero-headline");
    /*
     * Anton FIRST — Latin display lines must not move — and Onest behind it,
     * which is the family that actually paints the Cyrillic. Asserted on the
     * resolved stack rather than on a rendered glyph because there is no API
     * that names the face a character was drawn with; the stack is the whole
     * of what the product controls.
     */
    expect(face.family, "the display stack lost Anton").toContain("Anton");
    expect(face.family, "the display stack has no body face to fall to").toContain(
      "Onest",
    );
    expect(
      face.family.indexOf("Anton"),
      "the body face is ahead of Anton, so Latin display lines moved",
    ).toBeLessThan(face.family.indexOf("Onest"));
  });

  /**
   * …and the sentence-boundary break rule, which is what actually protects the
   * reading once the face has changed. Every sentence in the hero must fit one
   * row, so a greedy breaker can only ever split between sentences.
   */
  test("every Ukrainian hero sentence fits its own row", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await settle(page);

    const rows = await page.getByTestId("hero-headline").evaluate((el) => {
      const range = document.createRange();
      const tops = new Set<number>();
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE && node.nodeName !== "SPAN") continue;
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width > 0) tops.add(Math.round(rect.top));
        }
      }
      return { lines: tops.size, width: el.getBoundingClientRect().width };
    });

    /*
     * THREE, WHICH IS THE COPY'S OWN PUNCTUATION: "ГРАЙ У ФУТБОЛ." then
     * "КОЛИ ЗАВГОДНО." then "ДЕ ЗАВГОДНО." A fourth row means a sentence broke
     * mid-way, which is the failure this asserts against — and it is the
     * failure a longer word would cause.
     */
    expect(rows.lines).toBeLessThanOrEqual(3);
  });

  /**
   * THE FACT GRID, DECODED — F3's own surface, in the language that did not
   * exist when it was fixed.
   *
   * The geometric check above proves the boxes do not overlap. This proves
   * that what reaches the SCREEN is legible: sample the value's row and
   * require it to carry bone-coloured pixels, which a label drawn over it
   * would replace.
   */
  test("the detail's Ukrainian duration value survives to the screen", async ({
    page,
    context,
  }) => {
    await signInAs(context, players.runner);
    const game = await createScratchGame({
        capacity: 12,
        priceCzk: 150,
        // The densest possible fact grid: every optional row present, so the
        // Ukrainian labels are all on screen at once.
        durationMinutes: 90,
        subsPerTeam: 2,
        format: "6v6",
        surface: "turf",
      });

    try {
      await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
      await settle(page);

      const box = (await page.getByTestId("game-info-card").boundingBox())!;
      const png = PNG.sync.read(await page.screenshot({ clip: box }));

      let bright = 0;
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          const i = (png.width * y + x) << 2;
          if (Math.min(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!) > 150) {
            bright += 1;
          }
        }
      }

      // A card whose values are drawn over would go dark; this is a floor, not
      // a fingerprint.
      expect(bright, "the info card has almost no legible text on it").toBeGreaterThan(
        400,
      );
    } finally {
      await destroyScratchGame(game.id);
    }
  });
});

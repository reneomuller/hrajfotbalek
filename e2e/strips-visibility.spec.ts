import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";

/**
 * VISIBILITY + LAYOUT ROUND — 390px, EN.
 *
 * `docs/v13/strips/visibility/`.
 *
 * Items 1, 2 and 4. Item 3's strip is `strips-profile.spec.ts`, which has to
 * sit beside the reference screenshot and is gated on the owner's confirm
 * before anything propagates.
 *
 * EVERY STRIP ASSERTS WHAT IT CLAIMS BEFORE IT CAPTURES. Three strips in this
 * round's predecessors were wrong in the same way — a chip caught mid
 * `transition-colors`, a detail page that happened to land on a game with no
 * bookings — and each looked plausible. A screenshot is evidence of pixels, not
 * of state; the assertion is what makes it evidence of the ruling.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/visibility");

test.describe("visibility round strips", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test("calendar, lifted surfaces and the mark — en", async ({ page, context }) => {
    mkdirSync(OUT, { recursive: true });
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    const settle = async () => {
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({
        content:
          "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
      });
    };

    // --- item 1: the calendar fills the content width -----------------------
    await page.goto("/games", { waitUntil: "networkidle" });
    await settle();

    const picker = page.getByTestId("day-picker");
    await expect(picker).toBeVisible();

    /*
     * ~~NOTHING SCROLLS. The ruling is "scrolling calendars hide days", so the
     * assertion is on the scroll extent: a row whose content is wider than its
     * box has a day nobody can reach.~~
     *
     * REVERSED BY THE OWNER, ROUND 14 ITEM 5: the chips get "a noticeable
     * step" larger, "keeping the row scrollable".
     *
     * THE OLD RULING TRADED SIZE FOR REACHABILITY and the trade had gone bad.
     * Fitting nine cells across 346px left each one 38px wide carrying two
     * lines of type — a tap target below the 44px floor everything else in
     * this product respects, to protect days that were technically visible and
     * practically unreadable.
     *
     * SO THE PROPERTY CHANGES FROM "fits" TO "REACHABLE", which is what the
     * old rule was really protecting. A scrolling row reaches every day by
     * swiping; the assertions below are that the row genuinely CAN scroll to
     * its end, and that no cell is smaller than the tap floor.
     */
    const metrics = await picker.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overflowX: getComputedStyle(el).overflowX,
    }));

    expect(metrics.overflowX, "the row cannot scroll, so its tail is unreachable").toBe(
      "auto",
    );

    const boxes = await picker.evaluate((el) =>
      Array.from(el.children).map((child) => {
        const rect = child.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      }),
    );
    expect(boxes).toHaveLength(9);

    // EVERY CELL CLEARS THE TAP FLOOR, which is what the extra width bought.
    for (const box of boxes) {
      expect(box.width, "a day chip is below the 44px tap floor").toBeGreaterThanOrEqual(44);
      expect(box.width).toBeCloseTo(boxes[0].width, 0);
    }

    // The row starts on the page gutter, and its content genuinely exceeds the
    // box — otherwise "scrollable" is a property nothing exercises.
    expect(boxes[0].left).toBeCloseTo(22, 0);
    expect(
      metrics.scrollWidth - metrics.clientWidth,
      "the row does not actually overflow, so the days all fit and this is the old layout",
    ).toBeGreaterThan(0);

    // Equal gaps, and they are the `gap-2` the row declares.
    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i].left - boxes[i - 1].right).toBeCloseTo(8, 0);
    }

    await picker.screenshot({ path: path.join(OUT, "01-calendar-full-width.png") });

    // --- item 2: the lifted surface, on all three surfaces ------------------
    // The pills on a list card. Asserted on the COMPUTED values rather than on
    // the class name: `.lifted` is a component-layer class and a utility in the
    // markup outranks it, so reading the class back would prove only that it
    // was written, not that it won.
    const pill = page.getByTestId("card-when").first();
    await expect(pill).toBeVisible();
    const pillStyle = await pill.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        borderColor: s.borderTopColor,
        borderWidth: s.borderTopWidth,
        shadow: s.boxShadow,
      };
    });
    expect(pillStyle.background).toBe("rgb(22, 22, 22)"); // surface-raised
    /*
      A VOLT STROKE OVER `.lifted`'s FILL (second visibility round). The
      utilities layer outranks the component layer, which is the property the
      class was written to allow — so this assertion is also the proof that the
      override mechanism still works, not just that a colour was set.
    */
    expect(pillStyle.borderColor).toBe("rgb(200, 255, 0)"); // volt
    /*
      2px — a WHOLE device pixel. This asserted "1px" while the markup said
      `border-[1.5px]`, and both were "passing": Chrome snaps a sub-pixel
      border to the device grid, so the thicker outline the night round asked
      for never rendered and the spec agreed with the wrong number. See the
      note on the pill in GameCard.
    */
    expect(pillStyle.borderWidth).toBe("2px");
    // NO GLOW is half the ruling and the half most likely to creep back.
    expect(pillStyle.shadow).toBe("none");

    await page.getByTestId("game-row").first().screenshot({
      path: path.join(OUT, "02-list-card-pills.png"),
    });

    // The pass tier cards.
    await page.goto("/pass", { waitUntil: "networkidle" });
    await settle();
    const tier = page.getByTestId("pass-tier").first();
    await expect(tier).toBeVisible();
    const tierBg = await tier.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(tierBg).toBe("rgb(22, 22, 22)");
    await tier.screenshot({ path: path.join(OUT, "03-pass-tier-card.png") });

    /*
      Home's steps.

      THE LIFTED SURFACE MOVED OUT ONE LEVEL (redesign v2, round 3). This read
      `> div > div` and asserted `surface-raised` on each of three step CARDS.
      p01 draws one panel with hairline rules between the steps instead, so the
      lifted surface is now the panel and the rows sit transparent on it.

      The visibility requirement is unchanged and is what is still asserted:
      the thing that must read as an object against `ink` has the raised fill.
      Retargeted rather than deleted — the round moved the boundary, it did not
      remove it.
    */
    await page.goto("/", { waitUntil: "networkidle" });
    await settle();
    const steps = page.getByTestId("how-it-works");
    await steps.scrollIntoViewIfNeeded();
    const stepBg = await steps.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(stepBg).toBe("rgb(22, 22, 22)");
    await steps.screenshot({ path: path.join(OUT, "04-home-step-cards.png") });

    // --- item 4: the mark in the header -------------------------------------
    // That it LOADED, not merely that the element exists — a 404 on the src
    // renders as an empty box of exactly the right size, which a screenshot
    // shows as a gap in a dark header and nobody reads as a broken image.
    const brand = page.getByTestId("brand-mark");
    await expect(brand).toBeVisible();
    const loaded = await brand.evaluate(
      (el) => (el as HTMLImageElement).naturalWidth,
    );
    expect(loaded, "the header mark did not load").toBeGreaterThan(0);

    await page.getByTestId("site-header").screenshot({
      path: path.join(OUT, "05-header-mark.png"),
    });
  });
});

import { expect, test } from "@playwright/test";
import {
  COVER_HEIGHT_PX,
  COVER_WIDTH_PX,
  VENUE_HEIGHT_PX,
  VENUE_WIDTH_PX,
} from "../lib/storage/avatar";
import { players, serviceClient, signInAs } from "./helpers/session";

/**
 * ROUND 30, ITEM 7 — THE CROP FRAME IS THE RENDERED SURFACE'S ASPECT.
 *
 * WHAT WYSIWYG ACTUALLY REQUIRES. `PhotoCropper` draws its frame at the
 * OUTPUT's aspect, so "what you compose is what you get" holds only while the
 * output's aspect equals the aspect of the surface the photo lands in. Both
 * had drifted:
 *
 *   the venue band renders 390x208 (1.875) and was cropped at 16:9 (1.778)
 *   the profile banner renders 390x341 (1.144) and was cropped at 3:1
 *
 * The second is the bad one: a 3:1 strip dropped into a 1.14:1 box under
 * `object-cover` loses its SIDES, so a carefully framed banner showed its
 * middle third. Round 28 made the banner full-bleed and nothing moved the
 * constant with it.
 *
 * THIS SPEC IS THE THING THAT STOPS IT HAPPENING AGAIN. It measures what the
 * browser actually paints and compares it to the constant the cropper draws
 * from — so the next person who changes a band's height finds out here rather
 * than from the owner.
 *
 * 390 IS THE REFERENCE VIEWPORT AND THAT IS A REAL LIMIT. Both bands have a
 * fixed HEIGHT and take their width from the shell, so their aspect changes
 * with the window. The product is mobile-first, every spec runs at 390, and
 * matching there is matching where the photograph is looked at.
 */

test.use({ viewport: { width: 390, height: 844 } });

/** Within 1%: the constants are whole pixels and cannot hit a ratio exactly. */
const TOLERANCE = 0.01;

async function renderedAspect(page: import("@playwright/test").Page, testId: string) {
  return page.getByTestId(testId).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height, aspect: r.width / r.height };
  });
}

test("the venue crop frame matches the band the photo lands in", async ({ page }) => {
  // Arrange — any published game renders the venue band.
  const { data } = await serviceClient()
    .from("games")
    .select("id")
    .eq("status", "published")
    .limit(1)
    .single();

  // Act
  await page.goto(`/game/${(data as { id: string }).id}`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("hero-photo")).toBeVisible();
  const band = await renderedAspect(page, "hero-photo");

  // Assert
  const frame = VENUE_WIDTH_PX / VENUE_HEIGHT_PX;
  expect(band.height, "the band has no height to measure").toBeGreaterThan(0);
  expect(
    Math.abs(frame - band.aspect) / band.aspect,
    `crop frame ${frame.toFixed(3)} vs rendered band ${band.aspect.toFixed(3)} ` +
      `(${Math.round(band.width)}x${Math.round(band.height)}) — ` +
      `what the organizer composes is not what the page shows`,
  ).toBeLessThan(TOLERANCE);
});

test("the profile banner's crop frame matches its rendered band", async ({ page, context }) => {
  // Arrange
  await signInAs(context, players.runner);

  // Act
  await page.goto("/account", { waitUntil: "networkidle" });
  await expect(page.getByTestId("profile-cover-photo")).toBeVisible();
  const band = await renderedAspect(page, "profile-cover-photo");

  // Assert
  const frame = COVER_WIDTH_PX / COVER_HEIGHT_PX;
  expect(band.height, "the band has no height to measure").toBeGreaterThan(0);
  expect(
    Math.abs(frame - band.aspect) / band.aspect,
    `crop frame ${frame.toFixed(3)} vs rendered band ${band.aspect.toFixed(3)} ` +
      `(${Math.round(band.width)}x${Math.round(band.height)}) — ` +
      `a banner framed at this aspect will be cropped by the page`,
  ).toBeLessThan(TOLERANCE);
});

test("the two surfaces are genuinely different shapes, so one constant cannot serve both", async () => {
  /*
   * GUARDS AGAINST THE TIDY-MINDED FIX. The obvious simplification of the two
   * tests above is one shared constant — and it would be wrong: a pitch band
   * is a wide strip and a profile banner is nearly square. Stated as an
   * assertion so the simplification fails loudly instead of silently
   * reintroducing the surprise crop.
   */
  const venue = VENUE_WIDTH_PX / VENUE_HEIGHT_PX;
  const cover = COVER_WIDTH_PX / COVER_HEIGHT_PX;
  expect(Math.abs(venue - cover)).toBeGreaterThan(0.3);
});

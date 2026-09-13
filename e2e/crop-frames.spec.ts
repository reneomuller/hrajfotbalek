import { expect, test } from "@playwright/test";
import {
  COVER_HEIGHT_PX,
  COVER_WIDTH_PX,
  VENUE_HEIGHT_PX,
  VENUE_WIDTH_PX,
} from "../lib/storage/avatar";
import { players, serviceClient, signInAs } from "./helpers/session";

/**
 * ROUND 30 ITEM 7 / ROUND 31 ITEM 2 / ROUND 33 ITEM 4 — THE CROP FRAME IS THE
 * RENDERED SURFACE'S ASPECT, AND ROUND 33 FOUND OUT *WHICH* SURFACE.
 *
 * WHAT WYSIWYG ACTUALLY REQUIRES. `PhotoCropper` draws its frame at the
 * OUTPUT's aspect, so "what you compose is what you get" holds only while the
 * output's aspect equals the aspect of the surface the photo lands in.
 *
 * THREE ROUNDS PINNED IT TO THE WRONG SURFACE. The venue photograph feeds TWO
 * surfaces, measured live on production at two widths:
 *
 *            390px            430px
 *   card     344x159 = 2.167  384x159 = 2.419
 *   hero     390x235 = 1.658  430x235 = 1.828
 *
 * and the HERO HAS NO STABLE ASPECT AT ALL — two games on the same deploy at
 * the same width render 1.658 and 1.875, because the band is padding plus
 * CONTENT. Every previous round measured one game's hero, got one number, and
 * pinned the constant to a fixture. That is why the crop "was still wrong"
 * each time it was fixed.
 *
 * SO THE PINNED SURFACE IS THE CARD, whose height is fixed at 159px, and this
 * file now asserts THAT. The hero gets an assertion of its own — not equality,
 * which is impossible, but the CONSEQUENCE the pinning buys: the hero is
 * NARROWER than the frame, so `object-cover` trims its SIDES and never its top
 * or bottom. Losing the edges of a pitch is survivable; losing the goalposts is
 * the round-30 complaint.
 *
 * 390 IS THE REFERENCE VIEWPORT AND THAT IS A REAL LIMIT. Every band takes its
 * width from the shell, so its aspect changes with the window. The product is
 * mobile-first and matching at 390 is matching where the photograph is looked
 * at. `crop-truth.spec.ts` is the marked-image proof; this file is the guard
 * that catches a height change the day someone makes it.
 */

test.use({ viewport: { width: 390, height: 844 } });

/** Within 1%: the constants are whole pixels and cannot hit a ratio exactly. */
const TOLERANCE = 0.01;

async function renderedAspect(page: import("@playwright/test").Page, testId: string) {
  return page.getByTestId(testId).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height, aspect: r.width / r.height };
  });
}

test("the venue crop frame matches THE GAME CARD, which is the surface it is pinned to", async ({
  page,
}) => {
  // Arrange / Act — the games list renders a card per published game.
  await page.goto("/games", { waitUntil: "networkidle" });
  await expect(page.getByTestId("card-photo").first()).toBeVisible();
  const card = await renderedAspect(page, "card-photo");

  // Assert
  const frame = VENUE_WIDTH_PX / VENUE_HEIGHT_PX;
  expect(card.height, "the card photo has no height to measure").toBeGreaterThan(0);
  expect(
    Math.abs(frame - card.aspect) / card.aspect,
    `crop frame ${frame.toFixed(3)} vs rendered card ${card.aspect.toFixed(3)} ` +
      `(${Math.round(card.width)}x${Math.round(card.height)}) — ` +
      `what the organizer composes is not what the card shows`,
  ).toBeLessThan(TOLERANCE);
});

test("the detail hero is NARROWER than the frame, so it trims sides and never the top", async ({
  page,
}) => {
  /*
   * THE SECOND SURFACE, STATED RATHER THAN MATCHED. The hero cannot be matched
   * — its height is content-dependent — so what is asserted is the property
   * that makes pinning to the card safe: under `object-cover` a frame WIDER
   * than its box fills the height and loses width. Flip this inequality and
   * the hero starts eating the goalposts, which is the failure this whole
   * three-round saga was about.
   */
  // Arrange
  const { data } = await serviceClient()
    .from("games")
    .select("id")
    .eq("status", "published")
    .limit(1)
    .single();

  // Act
  await page.goto(`/game/${(data as { id: string }).id}`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("hero-photo")).toBeVisible();
  const hero = await renderedAspect(page, "hero-photo");

  // Assert
  const frame = VENUE_WIDTH_PX / VENUE_HEIGHT_PX;
  expect(
    hero.aspect,
    `hero ${hero.aspect.toFixed(3)} (${Math.round(hero.width)}x${Math.round(hero.height)}) ` +
      `is WIDER than the crop frame ${frame.toFixed(3)} — it now crops the frame's ` +
      `top and bottom, which is what the crop was moved off the hero to avoid`,
  ).toBeLessThan(frame);
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
   * GUARDS AGAINST THE TIDY-MINDED FIX. The obvious simplification of the
   * tests above is one shared constant — and it would be wrong: a pitch card
   * is a wide strip and a profile banner is nearly square. Stated as an
   * assertion so the simplification fails loudly instead of silently
   * reintroducing the surprise crop.
   */
  const venue = VENUE_WIDTH_PX / VENUE_HEIGHT_PX;
  const cover = COVER_WIDTH_PX / COVER_HEIGHT_PX;
  expect(Math.abs(venue - cover)).toBeGreaterThan(0.3);
});

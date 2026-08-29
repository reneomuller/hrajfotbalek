import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * REDESIGN v2, ROUND 2 — the list card over the pitch photo.
 *
 * `docs/redesign-v2/strips/card/`.
 *
 * THE CONTRAST FLOOR IS ASSERTED, NOT JUDGED (R6). A photograph behind text is
 * the one change that looks fine in a screenshot on a laptop and fails on a
 * phone in daylight, so the numbers are checked: the scrim covers the photo
 * exactly, and the time pill's volt stroke is still full-strength volt at
 * 1.5px over it. R6 names that outline specifically.
 *
 * `Join →` IS ASSERTED TO BE INERT (R1). Ruling E is upheld — the whole card
 * is one anchor — so the cue must contribute no link, no button, and no focus
 * stop. A round that "makes it work" reopens E, and this is the spec that
 * fails when someone does.
 */

const OUT = path.resolve(process.cwd(), "docs/redesign-v2/strips/card");

/** The disposable venue every scratch game sits at — `helpers/scaffold.ts`. */
const SCRATCH_VENUE = "E2E Scratch Pitch";

/**
 * Mean luminance of the card's title band, from the RENDERED pixels.
 *
 * DECODED FROM A SCREENSHOT, and it has to be. The composite is a JPEG behind
 * two stacked gradients; computing it from the source image and the CSS would
 * be reimplementing the compositor, and reading it off a canvas would measure
 * the image without its scrims. The screenshot is the only place the actual
 * answer exists.
 *
 * TEXT AND ACCENT PIXELS ARE EXCLUDED. The band contains white type and a volt
 * badge, and both would drag the mean up and mask exactly the regression this
 * guards against — a scrim creeping darker until the card is a slab with
 * texture.
 */
const TITLE_BAND_FLOOR = 45;

/**
 * THE FADE HAS A CEILING TOO (round 8, item 5).
 *
 * Below the boundary the card must be FLAT PAGE SURFACE, not a tenth of a
 * photograph. `ink` is rgb(8,8,8), so a correct fade measures single digits
 * there; the wash it replaced measured 29-31.
 *
 * THE NUMBERS AND THE WINDOW ARE BOTH MEASURED, not chosen. Band-by-band
 * against the rendered card: the fade now reads 8/9/9 across 70-100% and the
 * old wash read 31/29/15. Sampling 0.8-0.97 with a ceiling of 30 — the first
 * attempt — passed BOTH, because the photograph's own foreground is dark down
 * there. An assertion that cannot fail is worse than none, because it reports
 * coverage it does not have.
 */
const FADED_CEILING = 15;

/** Mean luminance of a horizontal slice, as a fraction of the card's height. */
async function sliceLuminance(
  card: import("@playwright/test").Locator,
  fromPct: number,
  toPct: number,
) {
  const shot = await card.screenshot();
  const png = PNG.sync.read(shot);

  const from = Math.round(png.height * fromPct);
  const to = Math.round(png.height * toPct);

  let total = 0;
  let counted = 0;
  for (let y = from; y < to; y += 2) {
    for (let x = Math.round(png.width * 0.06); x < png.width * 0.92; x += 3) {
      const i = (png.width * y + x) << 2;
      const r = png.data[i]!;
      const g = png.data[i + 1]!;
      const b = png.data[i + 2]!;
      if (g > 200 && b < 120) continue; // volt: badge, bar, cue
      if (Math.min(r, g, b) > 170) continue; // white type
      if (r > 180 && g > 120 && b < 80) continue; // warn/amber spots figure
      total += (r + g + b) / 3;
      counted += 1;
    }
  }
  return counted === 0 ? 0 : Math.round(total / counted);
}

/**
 * Mean luminance of the card's title band, from the RENDERED pixels.
 *
 * DECODED FROM A SCREENSHOT, and it has to be. The composite is a JPEG behind
 * two stacked gradients; computing it from the source image and the CSS would
 * be reimplementing the compositor, and reading it off a canvas would measure
 * the image without its scrims. The screenshot is the only place the actual
 * answer exists.
 *
 * TEXT AND ACCENT PIXELS ARE EXCLUDED. The band contains white type and a volt
 * badge, and both would drag the mean up and mask exactly the regression this
 * guards against — a scrim creeping darker until the card is a slab with
 * texture.
 */
function titleBandLuminance(card: import("@playwright/test").Locator) {
  // The title sits in the top fifth. Sampled below the very first rows so the
  // card's own rounded corners and border are not counted as "dark photo".
  return sliceLuminance(card, 0.06, 0.22);
}


test.use({ viewport: { width: 390, height: 844 } });

test("the card over the photo — scrim, outline and inert cue", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);

  // Soon enough to lead the board, far enough out that no policy sweep
  // touches it.
  const game = await createScratchGame({ capacity: 12, priceCzk: 150, hoursFromNow: 48 });

  try {
  await page.goto("/games", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });

  /*
   * A DISPOSABLE GAME WITH AN EMPTY ROSTER, NOT WHICHEVER CARD IS FIRST
   * (round 22). The diagnosis took three wrong guesses, so it is written down.
   *
   * IT WAS FAILING BEFORE THIS ROUND TOUCHED ANYTHING — reproduced at the
   * round-21 tip — which is why it is fixed here rather than reverted.
   *
   * The first two guesses were wrong. It is not the font stack (reverting it
   * changed nothing) and it is not a brighter venue cover (forcing the card to
   * one showing `pitch-default.jpg` still measured 16).
   *
   * WHAT IT ACTUALLY IS: the 0.72-0.9 band contains the AVATAR ROW, and this
   * function only excludes volt, white and amber pixels. A grey avatar is
   * neither, so every booked player adds mid-grey pixels to a mean that is
   * supposed to be measuring a photograph. The seed builds its board relative
   * to now, so which game leads — and how many faces it carries — changes with
   * the calendar. On 2026-08-27 the leader carried few enough to pass; two
   * days later it did not. The scrim never moved.
   *
   * So the card is now BUILT rather than found: default photo, nobody booked,
   * created and destroyed by this spec. The band then contains the photograph
   * and the card surface and nothing else, which is what every number in this
   * file was measured against.
   */
  const card = page
    .getByTestId("game-row")
    .filter({ hasText: SCRATCH_VENUE })
    .first();
  await expect(card).toBeVisible();

  // --- the photo actually LOADED ------------------------------------------
  // A 404 renders as an empty box of the right size, which photographs as a
  // dark card and reads as design.
  const photo = card.getByTestId("card-photo");
  await expect(photo).toBeAttached();
  expect(
    await photo.evaluate((el) => (el as HTMLImageElement).naturalWidth),
    "the pitch photo did not load",
  ).toBeGreaterThan(0);

  // --- the scrim covers the photo exactly ---------------------------------
  const cover = await card.evaluate((el) => {
    const p = el.querySelector('[data-testid="card-photo"]')!.getBoundingClientRect();
    const s = el.querySelector('[data-testid="card-scrim"]')!.getBoundingClientRect();
    return {
      dx: Math.abs(p.x - s.x),
      dy: Math.abs(p.y - s.y),
      dw: Math.abs(p.width - s.width),
      dh: Math.abs(p.height - s.height),
    };
  });
  expect(cover.dx).toBeLessThanOrEqual(1);
  expect(cover.dy).toBeLessThanOrEqual(1);
  expect(cover.dw).toBeLessThanOrEqual(1);
  expect(cover.dh).toBeLessThanOrEqual(1);

  /*
   * COVER, AND BOTTOM-ANCHORED (round 7, item 3).
   *
   * ~~The photo is centre-weighted so it does not stretch oddly.~~ `cover`
   * is what prevents the stretch and it is unchanged. What changed is WHERE
   * the crop sits: `pitch-default.jpg` is 640x336 and its top fifth is sky and
   * mountains, so `object-center` on a 358x159 strip put a pale sky directly
   * behind the venue title. That was the most conspicuous way this card failed
   * to match `p02`, whose card is green field edge to edge.
   *
   * Asserted rather than left to the screenshot because the two plausible
   * regressions — someone "tidying" it back to `object-center`, or a Tailwind
   * class rename — both leave a card that still looks like a card.
   */
  const fit = await photo.evaluate((el) => {
    const s = getComputedStyle(el);
    return { fit: s.objectFit, pos: s.objectPosition };
  });
  expect(fit.fit).toBe("cover");
  expect(fit.pos, "the crop drifted back to centre and the sky is behind the title").toBe(
    "50% 100%",
  );

  /*
   * THE PHOTOGRAPH IS VISIBLE BEHIND THE TITLE — measured, not judged.
   *
   * This is the round-7 defect stated as a number. R6 requires the photo to
   * read AS a photograph; the failure mode is a scrim that creeps up until the
   * card is a dark slab with texture, which is what the round-2 note already
   * warned about and what shipped anyway. `p02`'s card measures roughly 76
   * mean luminance across its title band and production was rendering about
   * 60.
   *
   * A FLOOR, NOT A TARGET. The exact number depends on the image and on the
   * type, and pinning it would fail on any future asset. 45 is comfortably
   * below the frame and comfortably above "dark slab".
   */
  const luminance = await titleBandLuminance(card);
  expect(
    luminance,
    `the photograph is not visible behind the title (mean ${luminance}, floor ${TITLE_BAND_FLOOR})`,
  ).toBeGreaterThanOrEqual(TITLE_BAND_FLOOR);

  /*
   * AND IT IS STILL THERE BEHIND THE TIME ROW. The boundary is below the time
   * pill, so this slice must be bright too — a fade that finishes early
   * satisfies the floor above and still loses the photograph where `p02`
   * clearly has it.
   */
  const timeRow = await sliceLuminance(card, 0.3, 0.5);
  expect(
    timeRow,
    `the photograph is gone behind the time row (mean ${timeRow})`,
  ).toBeGreaterThanOrEqual(TITLE_BAND_FLOOR);

  /*
   * AND IT IS GONE BY THE CAPACITY / AVATAR REGION. This is the half the
   * round-7 spec did not have: it proved the top was bright and said nothing
   * about where the image stopped, so a wash that never finished passed.
   */
  const belowBoundary = await sliceLuminance(card, 0.72, 0.9);
  expect(
    belowBoundary,
    `the photograph is still visible under the capacity bar and faces (mean ${belowBoundary}, ceiling ${FADED_CEILING})`,
  ).toBeLessThanOrEqual(FADED_CEILING);

  // --- R6's named requirement: the volt outline survives the photo --------
  const pill = card.getByTestId("card-when");
  const stroke = await pill.evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.borderTopColor, width: s.borderTopWidth };
  });
  expect(stroke.color, "the volt outline lost its colour over the photo").toBe(
    "rgb(200, 255, 0)",
  );
  // A WHOLE pixel. Chrome snaps sub-pixel borders to the device grid, so a
  // 1.5px rule is used as 1px here and an assertion on "1.5px" can only ever
  // fail — which is exactly how the night round's outline change went two
  // rounds without rendering.
  expect(stroke.width).toBe("2px");

  // --- R1: the cue is paint ------------------------------------------------
  const cue = card.getByTestId("card-join-cue");
  await expect(cue).toBeVisible();
  const inert = await cue.evaluate((el) => ({
    tag: el.tagName.toLowerCase(),
    href: el.getAttribute("href"),
    role: el.getAttribute("role"),
    tabindex: el.getAttribute("tabindex"),
    hidden: el.getAttribute("aria-hidden"),
    nestedInteractive: el.querySelectorAll("a,button").length,
  }));
  expect(inert.tag).toBe("span");
  expect(inert.href).toBeNull();
  expect(inert.role).toBeNull();
  expect(inert.nestedInteractive).toBe(0);
  expect(inert.hidden).toBe("true");

  // AND THE CARD IS STILL ONE ANCHOR — ruling E's actual requirement.
  const anchors = await card.evaluate((el) =>
    el.tagName.toLowerCase() === "a" ? el.querySelectorAll("a,button").length : -1,
  );
  expect(anchors, "the card is not an anchor, or it nests one").toBe(0);

  await card.screenshot({ path: path.join(OUT, "01-card-over-photo.png") });
  await page.screenshot({ path: path.join(OUT, "02-games-list.png"), fullPage: true });
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a past card drops the cue and stays untappable", async ({ page, context }) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  const { signInAs, players } = await import("./helpers/session.ts");
  await signInAs(context, players.runner);

  await page.goto("/account?tab=games", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const past = page.locator('[data-testid="game-row"][data-past="true"]').first();
  if ((await past.count()) === 0) test.skip(true, "no past game in the seed right now");

  // A call to action on a card that cannot be tapped is a lie about the card.
  await expect(past.getByTestId("card-join-cue")).toHaveCount(0);
  await past.screenshot({ path: path.join(OUT, "03-card-past.png") });
});

import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";

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

test.use({ viewport: { width: 390, height: 844 } });

test("the card over the photo — scrim, outline and inert cue", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);

  await page.goto("/games", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });

  const card = page.getByTestId("game-row").first();
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

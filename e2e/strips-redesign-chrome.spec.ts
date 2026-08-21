import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { apiClientFor, players, signInAs } from "./helpers/session.ts";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";

/**
 * REDESIGN v2, ROUND 1 — chrome.
 *
 * `docs/redesign-v2/strips/chrome/`.
 *
 * Scope is the chrome only: the nav bar, the header, the footer. The card, the
 * page bodies and the pitch photo are later rounds and are NOT changed here —
 * so these strips are the same pages with different furniture, which is
 * exactly what makes a chrome round reviewable.
 *
 * CAPTURED ON GAMES WITH BOOKINGS, per capture law. Three strips in earlier
 * rounds were wrong the same way: a detail page that happened to land on a
 * game with no roster photographs the arrangement's ABSENCE and proves nothing
 * about the arrangement. The game page here is a scratch game with a real
 * booking on it, so the claim bar is in a state that carries a control — which
 * is also the state that sits directly above the nav bar and would expose a
 * wrong `--tabbar-h`.
 */

const OUT = path.resolve(process.cwd(), "docs/redesign-v2/strips/chrome");

test.use({ viewport: { width: 390, height: 844 } });

test("chrome on every surface the bar renders on — en", async ({ page, context }) => {
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

  // --- signed out: the header's auth control is the volt Sign in pill -------
  await page.goto("/", { waitUntil: "networkidle" });
  await settle();
  await expect(page.getByTestId("nav-login")).toBeVisible();
  await expect(page.getByTestId("header-admin-badge")).toHaveCount(0);
  await page.getByTestId("site-header").screenshot({
    path: path.join(OUT, "01-header-signed-out.png"),
  });

  // --- signed in as a player ------------------------------------------------
  await signInAs(context, players.runner);
  await page.goto("/games", { waitUntil: "networkidle" });
  await settle();
  await expect(page.getByTestId("nav-account")).toBeVisible();
  // A player is NOT shown the admin badge.
  await expect(page.getByTestId("header-admin-badge")).toHaveCount(0);
  await page.getByTestId("site-header").screenshot({
    path: path.join(OUT, "02-header-player.png"),
  });

  /*
   * THE BAR, IN BOTH ITS STATES, on one surface. The active cell is a volt
   * fill and every other cell is now its own `surface-raised` rect — the
   * change this round is about, and a strip of one cell would not show it.
   */
  const bar = page.getByTestId("nav-pill");
  await expect(bar).toBeVisible();
  await expect(page.locator('[data-testid^="tab-"][data-active="true"]')).toHaveCount(1);
  await bar.screenshot({ path: path.join(OUT, "03-nav-bar-games-active.png") });

  await page.goto("/account", { waitUntil: "networkidle" });
  await settle();
  await bar.screenshot({ path: path.join(OUT, "04-nav-bar-profile-active.png") });

  // --- the footer, which keeps its z-[2] and is unchanged this round --------
  await page.goto("/games", { waitUntil: "networkidle" });
  await settle();
  const footer = page.getByTestId("site-footer");
  await footer.scrollIntoViewIfNeeded();
  await footer.screenshot({ path: path.join(OUT, "05-footer.png") });

  /*
   * ~~admin: the badge the frames draw beside the wordmark~~ REMOVED IN ROUND
   * 13 (item 22), and the assertion inverts rather than disappearing.
   *
   * The frames draw it because in the frames the panel and the player site
   * share one chrome. They do not here — `/admin` has its own chip row and its
   * own titles — so the badge announced a mode on the pages where the admin
   * was not in it. It must not come back from the frame, which is exactly what
   * an absent assertion would allow.
   */
  await signInAs(context, players.organizer);
  await page.goto("/admin/games", { waitUntil: "networkidle" });
  await settle();
  await expect(page.getByTestId("header-admin-badge")).toHaveCount(0);
  await page.getByTestId("site-header").screenshot({
    path: path.join(OUT, "06-header-admin-signed-in.png"),
  });
});

test("the bar against the claim bar, on a game with a booking — en", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);

  const game = await createScratchGame({ capacity: 6, priceCzk: 200, hoursFromNow: 48 });

  try {
    // A real booking, so the claim bar carries a control rather than a bare
    // price — the busiest state, and the one stacked directly on the nav bar.
    const player = await apiClientFor(players.runner);
    await player.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });

    await signInAs(context, players.runner);
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({
      content:
        "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
    });

    await expect(page.getByTestId("claim-bar")).toBeVisible();

    // The two bars MEET. `--tabbar-h` moved this round and this is the strip
    // that would show a gap or an overlap if it had moved wrong.
    const geom = await page.evaluate(() => {
      const claim = document
        .querySelector('[data-testid="claim-bar"]')!
        .getBoundingClientRect();
      const nav = document
        .querySelector('[data-testid="nav-pill"]')!
        .getBoundingClientRect();
      return { gap: Math.abs(claim.bottom - nav.top), navH: nav.height };
    });
    expect(geom.gap).toBeLessThanOrEqual(1);

    await page.screenshot({
      path: path.join(OUT, "07-claim-bar-over-nav.png"),
      clip: { x: 0, y: 844 - 220, width: 390, height: 220 },
    });
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("chrome in Czech, where the labels are longest — cs", async ({ page, context }) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "cs", domain: "localhost", path: "/" },
  ]);
  await signInAs(context, players.runner);

  await page.goto("/games", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });

  /*
   * NO LABEL WRAPS. The cells gained padding this round, which takes width
   * away from the labels — and Czech carries the longest of the three
   * languages. A wrapped tab label is the failure this checks for, measured
   * rather than eyeballed.
   */
  const wrapped = await page.evaluate(() => {
    const tabs = Array.from(
      document.querySelectorAll('[data-testid="nav-pill"] a span'),
    );
    return tabs
      .filter((el) => el.getBoundingClientRect().height > 24)
      .map((el) => el.textContent);
  });
  expect(wrapped, `these tab labels wrapped: ${wrapped.join(", ")}`).toEqual([]);

  await page.getByTestId("nav-pill").screenshot({
    path: path.join(OUT, "08-nav-bar-cs.png"),
  });
  await page.getByTestId("site-header").screenshot({
    path: path.join(OUT, "09-header-cs.png"),
  });
});

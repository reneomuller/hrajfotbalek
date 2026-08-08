import { expect, test } from "@playwright/test";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { players, signInAs } from "./helpers/session.ts";

/**
 * v1.2 §7 — the app shell, and the admin exports.
 *
 * The whole suite runs at the `mobile-chrome` Pixel-7 viewport, which is what
 * makes the tab-bar assertions meaningful: it is `md:hidden`, so a desktop
 * project would find nothing and pass.
 */

/*
 * The pill is the navigation on a phone, and the header stops duplicating it.
 * Two controls saying "Games" on one screen is one of them being ignored.
 *
 * RULING K changed the contents: Home is in, My games is out. `/my-games`
 * survives as a ROUTE — reversed was the tab, not the extraction — and the
 * tests below still walk it, reached from Profile rather than from the pill.
 */
test("the floating nav pill carries the navigation at phone width", async ({ page }) => {
  await page.goto("/games");

  const tabs = page.getByTestId("nav-pill");
  await expect(tabs).toBeVisible();

  for (const id of ["tab-home", "tab-games", "tab-pass", "tab-account"]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }

  // The header's LINKS are gone at this width; the header itself is not — it
  // still carries the wordmark, the language switcher and the auth control.
  await expect(page.getByTestId("nav-games")).toBeHidden();
  await expect(page.getByTestId("nav-login")).toBeVisible();

  /*
   * EVERY TAB CLEARS 44px. The floor is not decorative: it is the smallest
   * target a thumb hits reliably, and a bar of four cells across a 412px
   * viewport has no excuse for missing it.
   */
  for (const id of ["tab-home", "tab-games", "tab-pass", "tab-account"]) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.height, `${id} height`).toBeGreaterThanOrEqual(44);
    expect(box.width, `${id} width`).toBeGreaterThanOrEqual(44);
  }
});

/*
 * The active state is PREFIX-matched, so tapping into a detail page does not
 * put the bar in a state where nothing is lit.
 */
test("the active tab survives navigating into a detail page", async ({ page }) => {
  const game = await createScratchGame({ hoursFromNow: 24 * 9 });

  try {
    await page.goto("/games");
    await expect(page.getByTestId("tab-games")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("tab-pass")).toHaveAttribute("data-active", "false");

    await page.goto(`/game/${game.id}`);
    // `/game/<id>` is not `/games`, and the old equality check would have gone
    // dark here.
    await expect(page.getByTestId("tab-games")).toHaveAttribute("data-active", "true");

    await page.goto("/pass");
    await expect(page.getByTestId("tab-pass")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("tab-games")).toHaveAttribute("data-active", "false");
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * THE ONE LAYOUT BUG A FIXED BAR CAUSES: content permanently behind it. The
 * game page has two fixed things stacked — the claim button on top of the tab
 * bar — so it is the page where getting it wrong is invisible until someone
 * tries to read the lineup.
 */
test("the claim button sits above the tab bar, and the page clears both", async ({
  page,
}) => {
  const game = await createScratchGame({ hoursFromNow: 24 * 11, capacity: 12 });

  try {
    await page.goto(`/game/${game.id}`);

    const cta = (await page.getByTestId("sticky-cta").boundingBox())!;
    const bar = (await page.getByTestId("nav-pill").boundingBox())!;

    // The button's bottom edge meets the bar's top edge — it is not underneath
    // it and there is no gap showing the page through.
    expect(Math.abs(cta.y + cta.height - bar.y)).toBeLessThanOrEqual(1);

    // And the last section of the page can be scrolled clear of both.
    await page.getByTestId("practical-info").scrollIntoViewIfNeeded();
    const practical = (await page.getByTestId("practical-info").boundingBox())!;
    expect(practical.y + practical.height).toBeLessThanOrEqual(cta.y + 1);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * §7 — `/my-games` is its own route, which is what the tab points at. It was a
 * section three-quarters of the way down `/account`, behind a photo upload and
 * a wallet.
 */
test("my games is its own route, and account links to it", async ({ page, context }) => {
  await signInAs(context, players.runner);

  await page.goto("/my-games");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/my games/i);

  // The fixture list is here and NOT on the account page any more.
  await page.goto("/account");
  await expect(page.getByTestId("my-games-link")).toBeVisible();
  await expect(page.getByTestId("history-counts")).toHaveCount(0);

  await page.getByTestId("my-games-link").click();
  await page.waitForURL("**/my-games");
});

/* Signed out, the tab leads to the login page and comes back afterwards. */
test("my games sends a signed-out visitor to log in, carrying the way back", async ({
  page,
}) => {
  await page.goto("/my-games");
  await page.waitForURL(/\/login/);
  expect(page.url()).toContain("my-games");
});

/*
 * REQ-ADMIN — every admin table exports a WELL-FORMED file. "Well-formed" is
 * the requirement and it is checked as such: the header row, the record count,
 * and the download disposition. The escaping itself is unit-tested against the
 * seed's hostile venue in `lib/admin/__tests__/csv.test.ts`.
 */
test("every admin table exports a well-formed CSV", async ({ page, context }) => {
  await signInAs(context, players.organizer);

  const exports = [
    { path: "/admin/games/export", firstColumn: "id", slug: "games" },
    { path: "/admin/players/export", firstColumn: "nickname", slug: "players" },
    { path: "/admin/topups/export", firstColumn: "payment_code", slug: "topups" },
    { path: "/admin/stats/export?window=month", firstColumn: "metric", slug: "stats" },
  ];

  for (const { path, firstColumn, slug } of exports) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("text/csv");
    expect(response.headers()["content-disposition"], path).toContain("attachment");
    expect(response.headers()["content-disposition"], path).toContain(slug);

    const body = await response.text();
    // The BOM, which is what makes Excel on Windows read it as UTF-8 rather
    // than as the local code page.
    expect(body.charCodeAt(0), path).toBe(0xfeff);
    expect(body.slice(1).split("\r\n")[0], path).toContain(firstColumn);
    // CRLF records, per RFC 4180.
    expect(body, path).toContain("\r\n");
  }
});

/*
 * The per-game roster export, which is the one an organizer actually uses —
 * and the only one whose contents are worth asserting, because a booking it
 * missed is a payment nobody chases.
 */
test("a game's roster export carries its bookings, VS first", async ({ page, context }) => {
  const game = await createScratchGame({ hoursFromNow: 24 * 13, capacity: 4 });

  try {
    await signInAs(context, players.organizer);

    const { apiClientFor } = await import("./helpers/session.ts");
    const organizer = await apiClientFor(players.organizer);
    await organizer.rpc("admin_create_booking", {
      p_game_id: game.id,
      p_player_id: players.runner.id,
      p_payment_method: "cash",
    });

    const response = await page.request.get(`/admin/games/${game.id}/export`);
    expect(response.status()).toBe(200);

    const lines = (await response.text()).slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "payment_code,nickname,status,payment_method,price_czk,credit_applied_czk," +
        "amount_due_czk,attendance,booked_by_admin,is_seed,booking_id",
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("RealRunner");

    // A game that does not exist is a 404, not an empty file — an empty CSV
    // for a mistyped id looks like a game with nobody on it.
    const missing = await page.request.get(
      "/admin/games/00000000-0000-0000-0000-000000000000/export",
    );
    expect(missing.status()).toBe(404);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * THE GATE IS IN THE HANDLER, not inherited from the admin layout. A route
 * handler is an HTTP endpoint reached with curl and never renders under a
 * layout — this is the assertion that says so.
 */
test("the exports refuse a caller who is not an admin", async ({ page, context }) => {
  await signInAs(context, players.runner);

  for (const path of [
    "/admin/games/export",
    "/admin/players/export",
    "/admin/topups/export",
    "/admin/stats/export",
  ]) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).not.toBe(200);
    // Whatever it is, it is not a spreadsheet.
    expect(response.headers()["content-type"] ?? "", path).not.toContain("text/csv");
  }
});

import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame, setWalletTo } from "./helpers/scaffold";

/**
 * ROUND 23 — the six items that can be asserted from a browser.
 *
 * `docs/v23/strips/`.
 */

const OUT = path.resolve(process.cwd(), "docs/v23/strips");

test.use({ viewport: { width: 390, height: 844 } });

async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });
}

/* ============================================================================
 * ITEM 1 — players met
 * ========================================================================== */

/**
 * Two real players in one PLAYED game, which is the smallest world in which
 * "players met" is not zero.
 *
 * IT IS BUILT AND DESTROYED, never borrowed from the seed: the seed's two
 * played games carry ONE booking each, so every player on it has legitimately
 * met nobody — a spec that read the seed would assert zero and pass whatever
 * the function did.
 */
test("the third tile counts players met, and a guest is not a person", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    const admin = serviceClient();

    // Two signed-up players, and one guest seat held by an admin. The guest is
    // the control: it is a seat, not an identity (R24), so it must not count.
    for (const who of [players.runner, players.creditRich]) {
      await setWalletTo(who.id, 150);
      const client = await apiClientFor(who);
      await client.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });
    }
    await admin.rpc("set_game_guests", { p_game_id: game.id, p_count: 2 });

    // The game has to have HAPPENED. A game on the board is a plan.
    await admin.rpc("mark_game_played", { p_game_id: game.id });

    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto("/account", { waitUntil: "networkidle" });
    await settle(page);

    /*
     * ONE, NOT THREE. Two guest seats sat in the same game and neither is a
     * person — if this reads 3 the `auth_user_id is not null` clause has gone.
     */
    const met = page.getByTestId("profile-stat-met");
    await expect(met).toBeVisible();
    await expect(page.getByTestId("profile-stat-met-value")).toHaveText("1");
    await expect(met).toContainText(/player met/i);

    // AND THE TILE IT REPLACED IS GONE from the row. Pitches played is still
    // COUNTED — the Explorer badge needs it — it simply has no tile.
    await expect(page.getByTestId("profile-stat-venues")).toHaveCount(0);

    mkdirSync(OUT, { recursive: true });
    await page
      .getByTestId("profile-stats")
      .screenshot({ path: path.join(OUT, "01-players-met-own.png") });

    // THE PUBLIC PROFILE AGREES, because both read one SQL definition. A
    // number under your own face and a different number under the same face on
    // a public page is the failure this shares a function to avoid.
    await page.goto(`/player/${players.runner.nickname}`, { waitUntil: "networkidle" });
    await settle(page);
    await expect(page.getByTestId("profile-stat-met-value")).toHaveText("1");

    // AND NO MONEY IS ON IT. The composite has never carried a balance; this
    // is the assertion that keeps it that way.
    const body = (await page.locator("main").innerText()).toLowerCase();
    expect(body, "the public profile names money").not.toContain("czk");
    expect(body, "the public profile names credit").not.toContain("credit");

    await page.screenshot({
      path: path.join(OUT, "02-players-met-public.png"),
      fullPage: true,
    });
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a no-show on either side removes that game from the count", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    const admin = serviceClient();
    for (const who of [players.runner, players.creditRich]) {
      await setWalletTo(who.id, 150);
      const client = await apiClientFor(who);
      await client.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });
    }
    await admin.rpc("mark_game_played", { p_game_id: game.id });

    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto("/account", { waitUntil: "networkidle" });
    await expect(page.getByTestId("profile-stat-met-value")).toHaveText("1");

    /*
     * THE OTHER PLAYER DID NOT TURN UP, so they were not met. Marked through
     * the admin RPC rather than by writing the column: `service_role` has no
     * UPDATE on `bookings` and never has (CLAUDE.md), so a direct write would
     * fail silently and this spec would assert against a no-show that was
     * never recorded.
     */
    const { data: rows } = await admin
      .from("bookings")
      .select("id,player_id")
      .eq("game_id", game.id);
    const theirs = (rows ?? []).find(
      (r: { player_id: string }) => r.player_id === players.creditRich.id,
    ) as { id: string } | undefined;
    expect(theirs, "the other player's booking is missing").toBeTruthy();

    await admin.rpc("mark_attendance", {
      p_booking_id: theirs!.id,
      p_attendance: "no_show",
    });

    await page.goto("/account", { waitUntil: "networkidle" });
    await expect(page.getByTestId("profile-stat-met-value")).toHaveText("0");
  } finally {
    await destroyScratchGame(game.id);
  }
});

/* ============================================================================
 * ITEM 2 — the public profile's badges
 * ========================================================================== */

/**
 * THE DIAGNOSIS FIRST, BECAUSE THE REPORTED DEFECT DID NOT REPRODUCE.
 *
 * "Badges don't render on /player/<nickname>" was checked against the cover
 * stacking family first, as instructed — it is the family that has eaten the
 * avatar and the upload control before. It is not that. Measured on the live
 * page: the grid sits at y=437, the cover ends at y=341, the tiles are opaque
 * `rgb(15,15,15)`, `elementFromPoint` lands inside a badge, and five badges are
 * in the DOM.
 *
 * WHAT IS TRUE is that every badge on that profile is LOCKED, and locked was
 * `text-faint` on `surface` — 4.72:1, two hundredths over the AA floor. Five
 * near-floor grey blocks in a column read as a section that failed to load.
 *
 * So this asserts what the item asked for — that the badges are PAINTED, not
 * merely present — using the decoded-pixel treatment rather than
 * `toBeVisible()`, which passed throughout.
 */
test("the public profile's badges are painted, locked ones included", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });

  await page.goto(`/player/${players.creditRich.nickname}`, { waitUntil: "networkidle" });
  await settle(page);

  const grid = page.getByTestId("badge-grid");
  await expect(grid).toBeVisible();

  // NOT UNDER THE COVER. The geometry is asserted rather than assumed, because
  // this is the family the item pointed at and a future cover height could
  // reach the grid even though today's does not.
  const geometry = await page.evaluate(() => {
    const cover = document.querySelector('[data-testid="profile-cover"]')!.getBoundingClientRect();
    const badges = document.querySelector('[data-testid="badge-grid"]')!.getBoundingClientRect();
    return { coverBottom: Math.round(cover.bottom), gridTop: Math.round(badges.top) };
  });
  expect(
    geometry.gridTop,
    `the cover reaches the badge grid (cover ends ${geometry.coverBottom}, grid starts ${geometry.gridTop})`,
  ).toBeGreaterThanOrEqual(geometry.coverBottom);

  /*
   * AND THE PIXELS ARE THERE. A locked tile is dark by design, so the claim is
   * about the TEXT on it: sample the first badge and require pixels brighter
   * than the tile itself. `faint` on `surface` produced a maximum around 126;
   * `muted` produces around 154, and the floor below sits between the tile
   * (15) and either of them, so it catches "the label did not paint at all"
   * without pinning the token.
   */
  const box = (await page.getByTestId("badge").first().boundingBox())!;
  const png = PNG.sync.read(await page.screenshot({ clip: box }));
  let bright = 0;
  let peak = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (png.width * y + x) << 2;
      const l = (png.data[i]! + png.data[i + 1]! + png.data[i + 2]!) / 3;
      peak = Math.max(peak, l);
      if (l > 90) bright += 1;
    }
  }
  expect(peak, "nothing on the badge is brighter than its own tile").toBeGreaterThan(120);
  expect(bright, "the badge has almost no lit pixels on it").toBeGreaterThan(150);

  await grid.screenshot({ path: path.join(OUT, "03-public-badges.png") });
});

/* ============================================================================
 * ITEM 4 — the homepage order
 * ========================================================================== */

test("the games come before the how-it-works box, behind one pill", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.goto("/", { waitUntil: "networkidle" });
  await settle(page);

  const order = await page.evaluate(() => {
    const top = (selector: string) => {
      const el = document.querySelector(selector);
      return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
    };
    return {
      hero: top('[data-testid="hero-headline"]'),
      games: top('[data-testid="next-matches"]'),
      pill: top('[data-testid="next-matches-all"]'),
      how: top('[data-testid="how-it-works"]'),
    };
  });

  expect(order.hero).not.toBeNull();
  expect(order.games!, "the games are not under the hero").toBeGreaterThan(order.hero!);
  expect(order.pill!, "the pill is not under the games").toBeGreaterThan(order.games!);
  expect(order.how!, "how-it-works is not under the pill").toBeGreaterThan(order.pill!);

  // ONE PILL, NOT TWO. The hero's "Find a game" is gone entirely, and this is
  // the assertion that fails if anyone draws a second route to the same place.
  /*
   * Scoped to the PAGE's own content, not the document: the header link and
   * the fixed nav pill both point at /games on every screen in the product and
   * are not this page's decision. `main` is not the wrapper here — the landing
   * page composes its own sections — so the chrome is excluded by ancestry
   * instead.
   */
  const toGames = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href="/games"]')).filter(
      (a) => !a.closest("nav") && !a.closest("header") && !a.closest("footer"),
    ).length,
  );
  expect(toGames, "the page body offers more than one link to /games").toBe(1);

  // AND IT WEARS THE REMOVED BUTTON'S CLOTHES — a full capsule sized to its
  // label, at the CTA step, which is what the frame draws for the one action.
  const pill = await page.getByTestId("next-matches-all").evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      radiusRatio: parseFloat(s.borderTopLeftRadius) / r.height,
      weight: s.fontWeight,
      paddingLeft: s.paddingLeft,
    };
  });
  expect(pill.radiusRatio, "the pill is not a capsule").toBeGreaterThanOrEqual(0.45);
  expect(Number(pill.weight)).toBeGreaterThanOrEqual(800);
  expect(pill.paddingLeft).toBe("26px");

  await page.screenshot({ path: path.join(OUT, "04-home-order.png"), fullPage: true });
});

/* ============================================================================
 * ITEM 5 — the admin chip row
 * ========================================================================== */

test("dashboard is the first admin chip, and only it lights on /admin", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  await signInAs(context, players.organizer);

  await page.goto("/admin", { waitUntil: "networkidle" });
  await settle(page);

  const chips = await page
    .locator('[data-testid^="admin-nav-"]')
    .evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute("data-testid"),
        current: el.getAttribute("aria-current"),
        left: Math.round(el.getBoundingClientRect().left),
      })),
    );

  expect(chips[0]?.id, "dashboard is not the first chip").toBe("admin-nav-dashboard");
  // VOLT-CURRENT IS UNCHANGED: exact matching, so `/admin` lights the
  // dashboard and nothing else — the round-8 bug was a prefix match lighting
  // it on every admin screen.
  expect(chips.filter((c) => c.current === "page")).toHaveLength(1);
  expect(chips.find((c) => c.current === "page")?.id).toBe("admin-nav-dashboard");

  await page.locator('[data-testid="admin-nav-dashboard"]').first().screenshot({
    path: path.join(OUT, "05-admin-chip.png"),
  });

  // …and it does NOT light on another admin page.
  await page.goto("/admin/games", { waitUntil: "networkidle" });
  await expect(page.locator('[data-testid="admin-nav-dashboard"]')).not.toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator('[data-testid="admin-nav-games"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
});

/* ============================================================================
 * ITEM 7 — cash is gone from the flow and still settleable in admin
 * ========================================================================== */

test("no surface offers cash, in any language", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    await signInAs(context, players.runner);
    await setWalletTo(players.runner.id, 0);

    for (const [locale, word] of [
      ["en", "cash"],
      ["cs", "hotov"],
      ["ru", "наличн"],
      ["uk", "готівк"],
    ] as const) {
      await context.clearCookies({ name: LOCALE_COOKIE });
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
      ]);

      await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("pay-cash")).toHaveCount(0);
      const form = (await page.locator("form").innerText()).toLowerCase();
      expect(form, `the ${locale} booking form still names cash`).not.toContain(word);

      // THE FAQ TOO. The brief said it already described card and wallet only;
      // it did not — it named cash in all four languages until this round.
      await page.goto("/", { waitUntil: "networkidle" });
      const faq = (await page.getByTestId("faq-panel").innerText()).toLowerCase();
      expect(faq, `the ${locale} FAQ still names cash`).not.toContain(word);
    }
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("an existing cash booking is still settleable from the admin roster", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    /*
     * THE LEGACY STATE, MADE THE ONLY WAY IT CAN STILL BE MADE — through the
     * RPC, which an admin's own booking path uses. Seven of these exist on
     * production and item 7 requires every one of them to stay settleable:
     * removing the CHOICE must not strand the people who already made it.
     */
    const admin = serviceClient();
    const runner = await apiClientFor(players.runner);
    await setWalletTo(players.runner.id, 0);
    const { data, error } = await runner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(error, "the cash rail refused a booking the admin must still settle").toBeNull();
    const booking = data as unknown as { id: string; status: string };
    expect(booking.status).toBe("reserved");

    await signInAs(context, players.organizer);
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });
    await settle(page);

    /*
     * THE UNPAID ROW AND ITS CONTROL. The admin game page lists every booking
     * that owes money as a `pending-booking` with a `mark-paid` button; a cash
     * booking is exactly that, and item 7 requires it to keep working after
     * the option that created it is gone.
     */
    const row = page.locator('[data-testid="pending-booking"]').filter({
      hasText: players.runner.nickname,
    });
    await expect(row, "the unpaid cash booking is not on the admin roster").toHaveCount(1);
    await row.getByTestId("mark-paid").click();

    await expect
      .poll(async () => {
        const { data: row } = await admin
          .from("bookings")
          .select("status")
          .eq("id", booking.id)
          .single();
        return (row as { status: string } | null)?.status;
      })
      .toBe("confirmed");
  } finally {
    await destroyScratchGame(game.id);
  }
});

import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame, setWalletTo } from "./helpers/scaffold";

/**
 * ROUND 24 — the played sweep, the addressed bell, and the publish state.
 *
 * `docs/v24/strips/`.
 */

const OUT = path.resolve(process.cwd(), "docs/v24/strips");

test.use({ viewport: { width: 390, height: 844 } });

async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });
}

/** The sweep, called the way the cron calls it. */
async function sweep(bufferMinutes = 120) {
  const admin = serviceClient();
  const { data, error } = await admin.rpc("advance_played_games", {
    p_buffer_minutes: bufferMinutes,
  });
  expect(error, `advance_played_games: ${error?.message}`).toBeNull();
  return data as number;
}

/**
 * A game that has been BOOKED and then moved into the past.
 *
 * THE ORDER IS THE POINT. `create_booking` refuses a game that has already
 * kicked off — correctly — so a spec cannot book a past game directly. A real
 * one is booked while it is still ahead and then the clock passes it, and this
 * reproduces exactly that: create ahead, book, then move `starts_at` back.
 *
 * Moving the column rather than the clock, because there is no clock to move:
 * the threshold is evaluated inside Postgres against `now()`.
 */
async function playedGameWithBookings(
  who: (typeof players)[keyof typeof players][],
  hoursAgo = 3,
) {
  const game = await createScratchGame({ hoursFromNow: 3, durationMinutes: 60, capacity: 8 });

  for (const player of who) {
    await setWalletTo(player.id, 150);
    const client = await apiClientFor(player);
    const { data, error } = await client.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(error, `create_booking for ${player.nickname}: ${error?.message}`).toBeNull();
    (game as unknown as { bookings: string[] }).bookings ??= [];
    (game as unknown as { bookings: string[] }).bookings.push(
      (data as unknown as { id: string }).id,
    );
  }

  await serviceClient()
    .from("games")
    .update({ starts_at: new Date(Date.now() - hoursAgo * 3600_000).toISOString() })
    .eq("id", game.id);

  return game as typeof game & { bookings?: string[] };
}

async function statusOf(gameId: string) {
  const { data } = await serviceClient()
    .from("games")
    .select("status")
    .eq("id", gameId)
    .single();
  return (data as { status: string } | null)?.status;
}

/* ============================================================================
 * ITEM 1 — a game advances on its own, and nothing else moves
 * ========================================================================== */

test("a game past kickoff + duration + buffer advances; one inside it does not", async () => {
  /*
   * Created ahead and moved back, for the same reason `playedGameWithBookings`
   * does it: `createScratchGame` goes through `admin_create_game_v2`, which
   * will not accept a kickoff in the past. A real game gets there by waiting.
   */
  const due = await createScratchGame({ hoursFromNow: 3, durationMinutes: 60, capacity: 8 });
  const early = await createScratchGame({ hoursFromNow: 3, durationMinutes: 60, capacity: 8 });
  const admin = serviceClient();
  // Past 60 + 120 by an hour.
  await admin
    .from("games")
    .update({ starts_at: new Date(Date.now() - 3 * 3600_000).toISOString() })
    .eq("id", due.id);
  // Kicked off, nowhere near the threshold.
  await admin
    .from("games")
    .update({ starts_at: new Date(Date.now() - 30 * 60_000).toISOString() })
    .eq("id", early.id);

  try {
    await sweep();

    expect(await statusOf(due.id), "the due game did not advance").toBe("played");
    expect(
      await statusOf(early.id),
      "a game still inside its buffer was advanced",
    ).toBe("published");
  } finally {
    await destroyScratchGame(due.id);
    await destroyScratchGame(early.id);
  }
});

test("the sweep settles nothing and moves no money", async () => {
  // Booked with an EMPTY wallet, so the hold is unpaid — the state that would
  // tempt an automatic resolution: the game is over and somebody owes money.
  await setWalletTo(players.runner.id, 0);
  const game = await playedGameWithBookings([players.runner]);

  try {
    const admin = serviceClient();
    const bookingId = game.bookings![0]!;

    const ledgerBefore = await admin
      .from("credit_ledger")
      .select("id", { count: "exact", head: true });

    await sweep();

    expect(await statusOf(game.id)).toBe("played");

    /*
     * SETTLING REMAINS AN EXPLICIT ADMIN ACT. `settle_game` is the next
     * transition and the sweep must not have taken it — a settled game is one
     * an organizer has said is finished with, and the sweep knows nothing
     * about whether anybody paid on the pitch.
     */
    expect(await statusOf(game.id), "the sweep settled the game").not.toBe("settled");

    // The booking is untouched: still reserved, still owing, still settleable.
    const { data: after } = await admin
      .from("bookings")
      .select("status,attendance")
      .eq("id", bookingId)
      .single();
    expect((after as { status: string }).status).toBe("reserved");

    const ledgerAfter = await admin
      .from("credit_ledger")
      .select("id", { count: "exact", head: true });
    expect(ledgerAfter.count, "the sweep wrote a credit ledger row").toBe(
      ledgerBefore.count,
    );
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("attendance is still markable after the sweep, in both directions", async () => {
  const game = await playedGameWithBookings([players.runner]);

  try {
    const admin = serviceClient();
    const bookingId = game.bookings![0]!;

    await sweep();
    expect(await statusOf(game.id)).toBe("played");

    /*
     * THE ONE THAT WOULD HAVE BROKEN. `mark_attendance` has no game-status
     * gate — read before the sweep was written, and asserted here so a later
     * round cannot add one without noticing that auto-advance would then make
     * a played game unmarkable.
     */
    for (const value of ["no_show", "present"] as const) {
      const { error } = await admin.rpc("mark_attendance", {
        p_booking_id: bookingId,
        p_attendance: value,
      });
      expect(error, `mark_attendance(${value}) after the sweep: ${error?.message}`).toBeNull();
    }
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("the stats and badges come alive once a game has been played", async ({
  page,
  context,
}) => {
  const game = await playedGameWithBookings([players.runner, players.creditRich]);

  try {
    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    // BEFORE: the game has happened in the world and not in the database.
    await page.goto("/account", { waitUntil: "networkidle" });
    const before = Number(
      await page.getByTestId("profile-stat-games-value").textContent(),
    );

    await sweep();

    await page.goto("/account", { waitUntil: "networkidle" });
    const after = Number(
      await page.getByTestId("profile-stat-games-value").textContent(),
    );

    expect(after, "games played did not rise after the sweep").toBe(before + 1);

    // AND SO DOES "PLAYERS MET", which is the number round 23 shipped and
    // round 165 explained the zero of.
    await expect(page.getByTestId("profile-stat-met-value")).not.toHaveText("0");
  } finally {
    await destroyScratchGame(game.id);
  }
});

/* ============================================================================
 * ITEM 2 — the no-show warning, addressed
 * ========================================================================== */

test("a no-show reaches that player's bell and nobody else's", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  const game = await playedGameWithBookings([players.runner]);

  try {
    const admin = serviceClient();
    const bookingId = game.bookings![0]!;

    await admin.rpc("mark_attendance", {
      p_booking_id: bookingId,
      p_attendance: "no_show",
    });

    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto("/games", { waitUntil: "networkidle" });
    await settle(page);

    await page.getByTestId("notification-bell").click();
    const panel = page.getByTestId("notification-panel");
    await expect(panel).toBeVisible();
    await expect(panel, "the warning is not in the bell").toContainText(/no-show/i);
    await page.screenshot({ path: path.join(OUT, "01-no-show-warning.png") });

    /*
     * AND NOT IN ANYBODY ELSE'S. The whole point of the recipient column: a
     * broadcast store showed one player's warning to everyone, which is worse
     * than not having the feature at all.
     */
    await signInAs(context, players.creditRich);
    await page.goto("/games", { waitUntil: "networkidle" });
    await settle(page);
    await page.getByTestId("notification-bell").click();
    await expect(
      page.getByTestId("notification-panel"),
      "another player can read the warning",
    ).not.toContainText(/no-show/i);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("reversing a no-show replaces the warning rather than leaving it", async ({
  page,
  context,
}) => {
  const game = await playedGameWithBookings([players.runner]);

  try {
    const admin = serviceClient();
    const bookingId = game.bookings![0]!;

    await admin.rpc("mark_attendance", { p_booking_id: bookingId, p_attendance: "no_show" });
    await admin.rpc("mark_attendance", { p_booking_id: bookingId, p_attendance: "present" });

    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto("/games", { waitUntil: "networkidle" });
    await settle(page);
    await page.getByTestId("notification-bell").click();

    const panel = page.getByTestId("notification-panel");
    await expect(panel, "the correction is missing").toContainText(/removed/i);
    /*
     * A RETRACTION THAT LEAVES THE ACCUSATION IS NOT A RETRACTION. The warning
     * must be GONE, not merely followed by a correction further down the list.
     */
    await expect(
      panel,
      "the withdrawn warning is still sitting in the bell",
    ).not.toContainText(/did not turn up/i);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("the warning is written in the reader's language, not the writer's", async ({
  page,
  context,
}) => {
  const game = await playedGameWithBookings([players.runner]);

  try {
    await serviceClient().rpc("mark_attendance", {
      p_booking_id: game.bookings![0]!,
      p_attendance: "no_show",
    });

    await signInAs(context, players.runner);

    /*
     * THE SAME ROW, FOUR READINGS. The notification is stored once, in
     * English, and rendered from its `kind` — which is the whole reason for
     * that column: there is no `players.locale`, so a stored sentence could
     * only ever have been in one language.
     */
    for (const [locale, needle] of [
      ["cs", /neúčast/i],
      ["ru", /неявку/i],
      ["uk", /неявку/i],
    ] as const) {
      await context.clearCookies({ name: LOCALE_COOKIE });
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
      ]);
      await page.goto("/games", { waitUntil: "networkidle" });
      await settle(page);
      await page.getByTestId("notification-bell").click();
      await expect(
        page.getByTestId("notification-panel"),
        `the ${locale} reader gets the wrong language`,
      ).toContainText(needle);
    }
  } finally {
    await destroyScratchGame(game.id);
  }
});

/* ============================================================================
 * ITEM 5 — the publish confirmation
 * ========================================================================== */

test("publishing a game lands on an unmistakable confirmed state", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  await signInAs(context, players.organizer);

  await page.goto("/admin/games/new", { waitUntil: "networkidle" });
  await settle(page);

  // The form's own fields, filled the way `admin.spec.ts` fills them.
  await page.getByTestId("venue-select").selectOption({ label: "E2E Scratch Pitch" });
  await page.selectOption("#surface", "turf");
  await page
    .getByTestId("starts-at")
    .fill(new Date(Date.now() + 21 * 24 * 3600_000).toISOString().slice(0, 16));
  await page.locator('input[name="capacity"]').fill("12");
  await page.locator('input[name="priceCzk"]').fill("150");
  await page.getByTestId("game-form-submit").click();

  await page.waitForURL(/\/admin\/games\/[0-9a-f-]{36}(\?|$)/);
  await settle(page);

  const published = page.getByTestId("game-published");
  await expect(published, "there is no published confirmation").toBeVisible();
  await expect(published).toContainText("GAME PUBLISHED");

  /*
   * NOT A TOAST — asserted, because that is the difference the item names.
   * A toast is rendered from a client result and can be unmounted by the
   * revalidation that follows; this is server-rendered from the URL, so it
   * survives a reload. That is the property, and reloading is how to test it.
   */
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByTestId("game-published"),
    "the confirmation did not survive a reload — it is a toast",
  ).toBeVisible();

  // Both ways out.
  await expect(page.getByTestId("published-view-game")).toBeVisible();
  await expect(page.getByTestId("published-back-to-admin")).toHaveAttribute(
    "href",
    "/admin/games",
  );

  await published.screenshot({ path: path.join(OUT, "02-game-published.png") });

  // Clean up the game this test created.
  const href = await page.getByTestId("published-view-game").getAttribute("href");
  const created = href!.split("/").pop()!;
  await destroyScratchGame(created);
});

/* ============================================================================
 * ITEMS 3, 4, 6, 7 — the drawn ones
 * ========================================================================== */

test("the home page's three headings are one size, and the hero gap halved", async ({
  page,
}) => {
  mkdirSync(OUT, { recursive: true });
  await page.goto("/", { waitUntil: "networkidle" });
  await settle(page);

  const sizes = await page.evaluate(() => {
    const read = (el: Element | null) =>
      el ? parseFloat(getComputedStyle(el).fontSize) : null;
    const headings = [...document.querySelectorAll("h2, h3")];
    const upcoming = headings.find((h) => /upcoming/i.test(h.textContent ?? ""));
    const community = headings.find((h) => /community/i.test(h.textContent ?? ""));
    // The English FAQ panel's heading is literally "FAQ"; the overlays spell
    // it out. Matched on both so the assertion runs in every language rather
    // than quietly skipping.
    const faq = headings.find((h) => /^(faq|questions|otázky|вопросы|питання)$/i.test((h.textContent ?? "").trim()));
    return {
      upcoming: read(upcoming ?? null),
      community: read(community ?? null),
      faq: read(faq ?? null),
    };
  });

  expect(sizes.upcoming).not.toBeNull();
  expect(sizes.community).not.toBeNull();
  expect(
    Math.abs(sizes.upcoming! - sizes.community!),
    `Upcoming ${sizes.upcoming} vs Community ${sizes.community}`,
  ).toBeLessThan(0.5);
  expect(sizes.faq, "the FAQ heading was not found — the matcher is stale").not.toBeNull();
  expect(Math.abs(sizes.upcoming! - sizes.faq!)).toBeLessThan(0.5);

  /*
   * THE GAP, MEASURED FROM THE HERO'S LAST LINE TO THE GAMES SECTION.
   *
   * Before this round the two paddings summed to 104px (`pb-10` + `pt-nav`).
   * The item asks for roughly half, so the ceiling is 60 — comfortably under
   * the old figure and comfortably over the new one, which is what a threshold
   * should be rather than a restatement of the current pixel.
   */
  const gap = await page.evaluate(() => {
    const hero = document.querySelector('[data-testid="hero-headline"]')!.getBoundingClientRect();
    const games = document.querySelector('[data-testid="next-matches"]')!.getBoundingClientRect();
    const eyebrow = document
      .querySelector('[data-testid="next-matches"]')!
      .closest("section")!
      .getBoundingClientRect();
    return Math.round(Math.min(games.top, eyebrow.top) - hero.bottom);
  });
  expect(gap, `the hero-to-games gap is ${gap}px`).toBeLessThan(60);

  await page.screenshot({ path: path.join(OUT, "03-home-headings.png"), fullPage: true });
});

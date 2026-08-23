import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { signInAs } from "./helpers/session";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { apiClientFor, players, serviceClient } from "./helpers/session";
import { clearActiveBookings, createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * ROUND 14 ITEM 13 — public player profiles, quarantine LIFTED with a scope.
 *
 * `SCOPE.md` §2 quarantined this because a profile is the surface where a
 * product accidentally publishes a phone number. So the assertions that matter
 * are the NEGATIVE ones: the page shows four things and the RPC cannot be
 * asked for a fifth.
 */

test.use({ viewport: { width: 390, height: 844 } });

test("the page shows the four things in scope and nothing else", async ({ page, context }) => {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);

  const admin = serviceClient();
  const { data: player } = await admin
    .from("players")
    .select("nickname, email, phone, country")
    .eq("id", players.runner.id)
    .single();

  await page.goto(`/player/${encodeURIComponent(player!.nickname)}`, {
    waitUntil: "networkidle",
  });

  // The four in scope.
  await expect(page.getByTestId("public-nickname")).toHaveText(player!.nickname);
  await expect(page.getByTestId("public-avatar")).toBeVisible();
  await expect(page.getByTestId("profile-cover")).toBeVisible();
  await expect(page.getByTestId("profile-stats")).toBeVisible();
  await expect(page.getByTestId("badge-grid")).toBeVisible();

  /*
   * AND NOTHING ELSE. Asserted against the page's whole text rather than
   * against selectors: a selector-based check passes when a field is rendered
   * somewhere the test did not think to look, which is exactly how a profile
   * leaks a phone number.
   */
  const body = await page.locator("body").innerText();
  if (player!.email) expect(body, "the email is on the page").not.toContain(player!.email);
  if (player!.phone) expect(body, "the phone is on the page").not.toContain(player!.phone);

  // No wallet, no credits, no history, no tabs.
  await expect(page.getByTestId("credit-balance")).toHaveCount(0);
  await expect(page.getByTestId("credit-batches")).toHaveCount(0);
  await expect(page.getByTestId("past-games")).toHaveCount(0);
  await expect(page.getByTestId("profile-tabs")).toHaveCount(0);
  // And no control offering a stranger the file picker for somebody's photo.
  await expect(page.getByTestId("photo-cover-control")).toHaveCount(0);
  await expect(page.getByTestId("photo-avatar-control")).toHaveCount(0);
});

test("a roster face opens the player, and a guest's does not", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 8 });
  try {
    await clearActiveBookings("runner");
    const as = await apiClientFor(players.runner);
    // A party, so the row carries a real player AND two guests.
    await as.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
      p_guest_count: 2,
    });

    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });

    const roster = page.getByTestId("roster");
    // Exactly one linked row — the player. The two guests are not links.
    await expect(roster.getByTestId("roster-player-link")).toHaveCount(1);
    await expect(roster.locator('li[data-guest="true"] a')).toHaveCount(0);

    await roster.getByTestId("roster-player-link").click();
    await page.waitForURL(/\/player\//);
    await expect(page.getByTestId("public-nickname")).toHaveText(players.runner.nickname);
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(game.id);
  }
});

test("a guest, a shadow and a stranger all 404 the same way", async ({ page }) => {
  const admin = serviceClient();
  const { data: shadow } = await admin
    .from("players")
    .select("nickname")
    .is("auth_user_id", null)
    .limit(1)
    .single();

  for (const nickname of [shadow?.nickname, "no such person at all"].filter(Boolean)) {
    const response = await page.goto(`/player/${encodeURIComponent(nickname as string)}`);
    expect(response?.status(), `${nickname} did not 404`).toBe(404);
  }
});

test("the RPC is anon-callable and returns only the six columns", async () => {
  const { anonClient } = await import("./helpers/session");
  const anon = anonClient();

  const { data, error } = await anon.rpc("public_player_profile", {
    p_nickname: players.runner.nickname,
  });
  expect(error).toBeNull();

  /*
   * THE COMPOSITE IS THE BOUNDARY. Six keys, exactly — so a later edit to the
   * page cannot leak a field, because the field never arrives from the
   * database. Enumerated rather than spot-checked for the same reason the
   * roster view's column list is.
   */
  expect(Object.keys(data as object).sort()).toEqual([
    "cover_path",
    "games_played",
    "hours",
    "nickname",
    "photo_path",
    "venues",
  ]);
});


/**
 * ROUND 16 ITEM 3 — the avatar and the nickname, painted over by the banner.
 *
 * THE OBVIOUS INSTRUMENT PASSES AGAINST THIS BUG, which is the whole reason
 * the assertion below looks the way it does.
 *
 * `ProfileCover` is `absolute` — a POSITIONED element — and this page's
 * identity row was a plain in-flow `<section>`. Positioned content paints
 * above non-positioned in-flow content at the same stacking level whatever the
 * source order, so the cover's two scrims went over the avatar and the name.
 * White under a 55% ink ramp is the grey the owner reported as invisible.
 *
 * `document.elementFromPoint` at the nickname's centre answered
 * `public-nickname`: on top, reachable, and unreadable. The cover layer is
 * `pointer-events-none`, so hit-testing skips the scrims entirely — painting
 * does not. That is CLAUDE.md's `z-50` lesson from the other end. There, a
 * thing that looked right could not be touched; here, a thing that can be
 * touched does not look right. Two questions, two instruments.
 *
 * SO IT MEASURES DECODED PIXELS. White text under the ramp tops out around
 * 115; unobscured it reaches 255. The floor is 200 — far above what the bug
 * could produce and far below what a correct render gives, so it discriminates
 * without being brittle about anti-aliasing.
 */
test("the name and the face are not painted over by the banner", async ({
  page,
  context,
}) => {
  const admin = serviceClient();
  // A cover has to be SET for the bug to appear — the default pitch is dark
  // enough that grey-on-grey reads as intentional.
  await admin
    .from("players")
    .update({ cover_path: "players/probe.cover.webp" })
    .eq("id", players.runner.id);

  try {
    await signInAs(context, players.creditRich);
    await page.goto(`/player/${players.runner.nickname}`, { waitUntil: "networkidle" });

    /** The brightest pixel inside an element, as actually rendered. */
    async function peak(testId: string): Promise<number> {
      const png = PNG.sync.read(await page.getByTestId(testId).screenshot());
      let best = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        // Rec. 601 luma — the same weighting the profile strips use.
        const l =
          0.299 * png.data[i]! + 0.587 * png.data[i + 1]! + 0.114 * png.data[i + 2]!;
        if (l > best) best = l;
      }
      return best;
    }

    expect(
      await peak("public-nickname"),
      "the nickname is dimmed — the cover is painting over the identity row",
    ).toBeGreaterThan(200);

    expect(
      await peak("public-avatar"),
      "the avatar is dimmed — the cover is painting over the identity row",
    ).toBeGreaterThan(150);

    /*
     * AND THE ROW IS POSITIONED, stated directly. The pixel test is the one
     * that catches the defect; this names the cause, so a future edit that
     * strips `relative` fails with the reason rather than with a number.
     */
    const positioned = await page
      .getByTestId("public-identity")
      .evaluate((el) => getComputedStyle(el).position);
    expect(positioned, "the identity row is not positioned, so the cover outranks it").not.toBe(
      "static",
    );
  } finally {
    await admin.from("players").update({ cover_path: null }).eq("id", players.runner.id);
  }
});

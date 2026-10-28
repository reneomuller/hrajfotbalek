import { expect, test, type Page } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { PROFILE_PHOTOS_BUCKET } from "../lib/storage/avatar";
import { createAccount, removeAccount, signInThroughForm } from "./helpers/accounts";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";
import { anonClient, serviceClient } from "./helpers/session";
import {
  centreColour,
  isColour,
  MAGENTA,
  solidImage,
  uploadThroughCropper,
  YELLOW,
} from "./helpers/solidPhoto";

/**
 * ROUND 41 — "one of my friends still sees his old profile pic everywhere but
 * for the rest of us it's updated."
 *
 * The rosters, the card avatar stacks, the public profile and the player of the
 * month built the photo URL with NO version, and the admin used `created_at`,
 * which never moves. Whoever had loaded the old face — at the widths the
 * optimizer had cached it for a year — kept it; whoever had not saw the new
 * one. Hence "for the rest of us it's updated".
 *
 * So the second viewer here is the point: it loads the FIRST photo before the
 * replacement, then must see the second. And `src` must change, because the
 * production optimizer (off locally — CLAUDE.md) keys its year on the URL.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function uploadAvatar(page: Page, image: Buffer): Promise<void> {
  await page.goto("/account");
  // The cropper closes BEFORE the upload ends; the last step is the server
  // action that expires the cached versions. Leaving the page earlier cancels
  // it (CLAUDE.md) and the next render keeps the old version for a minute.
  const expired = page.waitForResponse(
    (response) => response.request().method() === "POST" && "next-action" in response.request().headers(),
  );
  await uploadThroughCropper(page, page.getByTestId("photo-input"), image);
  await expired;
}

test("a replaced profile photo shows on the roster and the public profile for someone who saw the old one", async ({
  page,
  browser,
}) => {
  test.slow();

  // Arrange — a throwaway player, booked into a scratch game, with a photo.
  const account = await createAccount();
  const game = await createScratchGame({ capacity: 10 });
  const viewer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const client = anonClient();
    const signedIn = await client.auth.signInWithPassword({ email: account.email, password: account.password });
    if (signedIn.error) throw new Error(`signIn: ${signedIn.error.message}`);
    const booked = await client.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });
    if (booked.error) throw new Error(`create_booking: ${booked.error.message}`);

    await page.context().addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
    await signInThroughForm(page, account);
    await uploadAvatar(page, await solidImage(page, MAGENTA));

    // The other viewer loads the FIRST photo on both surfaces, so it is cached.
    await viewer.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
    const other = await viewer.newPage();
    const rosterPhoto = other
      .getByTestId("roster")
      .locator("li", { hasText: account.nickname })
      .getByTestId("roster-avatar-photo");
    const publicPhoto = other.getByTestId("public-avatar").locator("img");
    const profilePath = `/player/${encodeURIComponent(account.nickname)}`;
    // `goto` can resolve on a loading skeleton (CLAUDE.md): wait for what only
    // the real page renders before reading a pixel.
    const openRoster = async () => {
      await other.goto(`/game/${game.id}`);
      await expect(rosterPhoto).toBeVisible({ timeout: 15_000 });
    };
    const openProfile = async () => {
      await other.goto(profilePath);
      await expect(other.getByTestId("public-nickname")).toHaveText(account.nickname, { timeout: 15_000 });
    };

    await openRoster();
    await expect.poll(() => centreColour(other, rosterPhoto).then((c) => isColour(c, MAGENTA))).toBe(true);
    const firstRosterSrc = await rosterPhoto.getAttribute("src");
    await openProfile();
    await expect.poll(() => centreColour(other, publicPhoto).then((c) => isColour(c, MAGENTA))).toBe(true);
    const firstPublicSrc = await publicPhoto.getAttribute("src");
    const own = page.getByTestId("account-avatar").locator("img");
    await page.goto("/account");
    const firstOwnSrc = await own.getAttribute("src");

    // Act — the player replaces it.
    await uploadAvatar(page, await solidImage(page, YELLOW));

    // Assert — the player's own page, at once: the upload expires the cached
    // versions, so the very next render carries the new one…
    await page.goto("/account");
    expect(await own.getAttribute("src"), "the account page kept the old photo URL").not.toBe(firstOwnSrc);
    await expect
      .poll(() => centreColour(page, own).then((c) => isColour(c, YELLOW)), {
        message: "the account page still shows the first photo",
      })
      .toBe(true);

    // …and, for the viewer who already held the old face, the roster…
    await openRoster();
    await expect
      .poll(() => centreColour(other, rosterPhoto).then((c) => isColour(c, YELLOW)), {
        message: "the roster still shows the first photo",
      })
      .toBe(true);
    expect(await rosterPhoto.getAttribute("src")).not.toBe(firstRosterSrc);

    // …and the public profile.
    await openProfile();
    await expect
      .poll(() => centreColour(other, publicPhoto).then((c) => isColour(c, YELLOW)), {
        message: "the public profile still shows the first photo",
      })
      .toBe(true);
    expect(await publicPhoto.getAttribute("src")).not.toBe(firstPublicSrc);
  } finally {
    await viewer.close();
    await destroyScratchGame(game.id);
    if (account.playerId) {
      await serviceClient()
        .storage.from(PROFILE_PHOTOS_BUCKET)
        .remove([`players/${account.playerId}.webp`]);
    }
    await removeAccount(account);
  }
});

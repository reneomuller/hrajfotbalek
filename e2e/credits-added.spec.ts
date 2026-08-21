import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, signInAs, signOut } from "./helpers/session";
import { resetWallet, setWalletTo } from "./helpers/scaffold";

/**
 * ROUND 15 ITEM 2 — the credits-added page.
 *
 * THE SIBLING OF THE BOOKING CONFIRMATION, and tested for the two things that
 * make it one: it is a full stop rather than a receipt, and it counts in
 * CREDITS. A CZK figure creeping back onto this screen would be the credits
 * ruling losing exactly where it is taught.
 *
 * THE COUNT IS THE WALLET, NOT THE PURCHASE, and that distinction is the
 * failure this file is really guarding. Rendering the tier off the top-up row
 * would look right in every test where the buyer started at zero, and would
 * be wrong for every player who already had credit — which is most of them,
 * after the first month.
 */

test.use({ viewport: { width: 390, height: 844 } });

const CREDIT_CZK = 150;

test.describe("credits added", () => {
  test.afterEach(async () => {
    await resetWallet(players.creditPartial.id);
  });

  test("counts the WALLET, not the purchase that arrived at it", async ({
    page,
    context,
  }) => {
    // Arrange — a player who already holds credit, which is the case a
    // purchase-shaped implementation gets wrong.
    await setWalletTo(players.creditPartial.id, 7 * CREDIT_CZK);
    await signInAs(context, players.creditPartial);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    // Act
    await page.goto("/pass/credits-added", { waitUntil: "networkidle" });

    // Assert
    const panel = page.getByTestId("credits-added");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-credits", "7");
    await expect(page.getByTestId("credits-added-count")).toContainText("7 credits");
  });

  test("says it in credits and never in crowns", async ({ page, context }) => {
    // Arrange
    await setWalletTo(players.creditPartial.id, 3 * CREDIT_CZK);
    await signInAs(context, players.creditPartial);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    // Act
    await page.goto("/pass/credits-added", { waitUntil: "networkidle" });

    // Assert
    const text = await page.getByTestId("credits-added").innerText();
    expect(text).toContain("3 credits");
    /*
     * THE ASSERTION INVERTS rather than disappearing: if a later round puts a
     * crown figure back on this screen — "450 CZK of credit" — this fails and
     * names the ruling it broke.
     */
    expect(text, "a CZK figure is back on the credits screen").not.toMatch(/CZK|Kč/);
  });

  /*
   * ONE ACTION, and the owner named which one. Not "buy another pass": credit
   * is only worth something spent, and pointing back at the shop from a
   * success screen is how a player ends up with two passes and no game.
   */
  test("offers exactly one action, and it is the games list", async ({ page, context }) => {
    // Arrange
    await setWalletTo(players.creditPartial.id, CREDIT_CZK);
    await signInAs(context, players.creditPartial);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    // Act
    await page.goto("/pass/credits-added", { waitUntil: "networkidle" });

    // Assert
    const actions = page.getByTestId("credits-added").locator("a, button");
    await expect(actions).toHaveCount(1);

    await page.getByTestId("credits-added-back").click();
    await page.waitForURL(/\/games/);
  });

  /*
   * THE SINGULAR, WHICH IS WHERE PLURALS GO WRONG QUIETLY. Czech and Russian
   * both have a 2–4 form this page's sentence has to survive; the count is
   * substituted as a phrase precisely so the sentence does not try to agree
   * with a number. One credit is the case an English-only reviewer reads as
   * fine in every language.
   */
  test("agrees with the count in Czech, at one and at three", async ({ page, context }) => {
    await signInAs(context, players.creditPartial);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "cs", domain: "localhost", path: "/" },
    ]);

    await setWalletTo(players.creditPartial.id, CREDIT_CZK);
    await page.goto("/pass/credits-added", { waitUntil: "networkidle" });
    await expect(page.getByTestId("credits-added-count")).toContainText("1 kredit");

    await setWalletTo(players.creditPartial.id, 3 * CREDIT_CZK);
    await page.goto("/pass/credits-added", { waitUntil: "networkidle" });
    await expect(page.getByTestId("credits-added-count")).toContainText("3 kredity");
  });

  test("is behind the sign-in, and resumes here", async ({ page, context }) => {
    await signOut(context);
    await page.goto("/pass/credits-added");

    await page.waitForURL(/\/login/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/pass/credits-added");
  });
});

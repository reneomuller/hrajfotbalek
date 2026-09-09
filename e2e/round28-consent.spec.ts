import { expect, test } from "@playwright/test";

/**
 * ROUND 28, ITEM 1 — the consent sheet's own behaviour.
 *
 * THIS FILE CLEARS THE COOKIE THE SUITE SEEDS. `playwright.config.ts` gives
 * every context a stored `necessary` answer, because the sheet is
 * `fixed bottom-0` and an unanswered one covers the nav pill and the claim bar
 * — which failed twelve specs that have nothing to do with cookies. Here, and
 * only here, the browser is a first-time visitor.
 */

test.use({ viewport: { width: 390, height: 844 } });

test("a first-time visitor is asked, and the answer sticks", async ({ page, context }) => {
  // Arrange — a browser that has never answered.
  await context.clearCookies();

  // Act
  await page.goto("/", { waitUntil: "networkidle" });

  // Assert — the sheet is there, with both answers.
  const sheet = page.getByTestId("cookie-consent");
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("consent-accept-all")).toBeVisible();
  await expect(page.getByTestId("consent-necessary")).toBeVisible();

  /*
   * IT IS PORTALLED, AND THIS IS THE ASSERTION THAT PROVES IT. `z-50` inside a
   * `relative z-10` shell loses to the nav pill — the mistake this project has
   * made twice. `elementFromPoint` at the accept button's centre must return
   * the button rather than whatever is stacked over it.
   */
  const reachable = await page.getByTestId("consent-accept-all").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el.contains(hit) || el === hit;
  });
  expect(reachable, "something is covering the consent button").toBe(true);

  // Act — answer it.
  await page.getByTestId("consent-necessary").click();
  await expect(sheet).toHaveCount(0);

  // Assert — the choice survives a reload, so nobody is asked twice.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("cookie-consent")).toHaveCount(0);

  const stored = await context.cookies();
  expect(stored.find((c) => c.name === "hf-consent")?.value).toBe("necessary");
});

test("the footer brings the choice back after it has been made", async ({ page }) => {
  // Arrange — the suite's seeded answer means no sheet on load.
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByTestId("cookie-consent")).toHaveCount(0);

  // Act — the footer's way back in.
  await page.getByTestId("cookie-settings").scrollIntoViewIfNeeded();
  await page.getByTestId("cookie-settings").click();

  // Assert
  await expect(page.getByTestId("cookie-consent")).toBeVisible();

  // And a different answer replaces the old one.
  await page.getByTestId("consent-accept-all").click();
  await expect(page.getByTestId("cookie-consent")).toHaveCount(0);
});

test("an answered visitor never sees the sheet over the nav pill", async ({ page }) => {
  /*
   * THE REGRESSION GUARD FOR WHAT ACTUALLY BROKE. Twelve specs failed because
   * the sheet sat on top of the bottom chrome; this asserts the normal case
   * directly rather than leaving it implied by those twelve passing again.
   */
  // Arrange / Act
  await page.goto("/games", { waitUntil: "networkidle" });

  // Assert
  await expect(page.getByTestId("cookie-consent")).toHaveCount(0);
  await expect(page.getByTestId("nav-pill")).toBeVisible();
});

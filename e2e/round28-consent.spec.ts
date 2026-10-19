import { expect, test } from "@playwright/test";

/**
 * ~~ROUND 28, ITEM 1 — the consent sheet's own behaviour.~~
 *
 * THE SHEET IS OFF (2026-10-19). The site sets only necessary cookies, which
 * need no consent, and the lawyer's brief (item 9.1) says no banner should
 * show while that is true; the footer links the cookie policy instead.
 * `CookieConsent` is kept unmounted for the day analytics needs it, and that
 * day this file gets its first two tests back.
 *
 * THIS FILE CLEARS THE COOKIE THE SUITE SEEDS, so the first test is a genuine
 * first-time visitor rather than one the config has already answered for.
 */

test.use({ viewport: { width: 390, height: 844 } });

test("a first-time visitor is not asked about cookies", async ({ page, context }) => {
  // Arrange — a browser that has never answered.
  await context.clearCookies();

  // Act
  await page.goto("/", { waitUntil: "networkidle" });

  // Assert
  await expect(page.getByTestId("cookie-consent")).toHaveCount(0);
  await expect(page.getByTestId("nav-pill")).toBeVisible();
});

test("the footer leads to the cookie policy", async ({ page }) => {
  // Arrange
  await page.goto("/games");
  const footer = page.getByTestId("site-footer");
  await footer.scrollIntoViewIfNeeded();

  // Act
  await footer.locator('a[href="/cookies"]').click();

  // Assert
  await page.waitForURL(/\/cookies$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Zásady používání cookies" }),
  ).toBeVisible();
  await expect(page.getByTestId("cookie-settings")).toHaveCount(0);
});

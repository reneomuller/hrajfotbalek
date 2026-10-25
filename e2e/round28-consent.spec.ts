import { expect, test } from "@playwright/test";

/**
 * THE COOKIE BANNER — present exactly when there is something to consent to.
 *
 * WITHOUT A GTM CONTAINER (round 40's default, and this suite's): the site
 * sets only necessary cookies, so per the lawyer's brief (Texty pro web 9.1)
 * there is no banner and the footer simply links the cookie policy.
 *
 * WITH ONE (`NEXT_PUBLIC_GTM_ID` set for the test server): the lawyer's banner
 * (9.2–9.3) — three answers of equal weight, a settings layer whose optional
 * categories start off, the choice stored and reopenable from the footer.
 *
 * Each half registers only when its condition holds, so neither appears as a
 * skipped test in the other configuration.
 *
 * THIS FILE CLEARS THE COOKIE THE SUITE SEEDS, so a "first-time visitor" is
 * genuinely one rather than one the config has already answered for.
 */

test.use({ viewport: { width: 390, height: 844 } });

// The same rule as `gtmContainerId` in lib/analytics/gtm.ts — restated, because
// that module imports through the `@/` alias, which specs here do not use.
const gtmOn = /^GTM-[A-Z0-9]{4,}$/.test((process.env.NEXT_PUBLIC_GTM_ID ?? "").trim());

if (!gtmOn) {
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
}

if (gtmOn) {
  test("a first-time visitor gets three answers of equal weight", async ({ page, context }) => {
    // Arrange
    await context.clearCookies();

    // Act
    await page.goto("/", { waitUntil: "networkidle" });
    const banner = page.getByTestId("cookie-consent");
    const answers = ["consent-accept-all", "consent-reject-all", "consent-open-settings"].map(
      (id) => banner.getByTestId(id),
    );
    const looks = await Promise.all(
      answers.map((answer) =>
        answer.evaluate((el) => {
          const style = getComputedStyle(el);
          return [style.backgroundColor, style.color, style.fontWeight, style.borderColor, Math.round(el.getBoundingClientRect().height)].join("|");
        }),
      ),
    );

    // Assert — the same look for all three is the compliance property (9.3).
    await expect(banner).toBeVisible();
    expect(new Set(looks).size, `the answers differ: ${looks.join(" / ")}`).toBe(1);
  });

  test("Reject all is remembered, and the footer reopens the settings with everything off", async ({
    page,
    context,
  }) => {
    // Arrange
    await context.clearCookies();
    await page.goto("/", { waitUntil: "networkidle" });

    // Act
    await page.getByTestId("consent-reject-all").click();
    await page.reload({ waitUntil: "networkidle" });
    const stillAsked = await page.getByTestId("cookie-consent").count();
    await page.getByTestId("cookie-settings").click();

    // Assert
    expect(stillAsked, "the banner came back after a refusal").toBe(0);
    await expect(page.getByTestId("consent-settings")).toBeVisible();
    await expect(page.getByTestId("consent-analytics")).not.toBeChecked();
    await expect(page.getByTestId("consent-marketing")).not.toBeChecked();
    await expect(page.getByTestId("consent-necessary")).toBeChecked();
    await expect(page.getByTestId("consent-necessary")).toBeDisabled();
  });

  test("a saved selection is stored with its date and version, and told to GTM", async ({
    page,
    context,
  }) => {
    // Arrange
    await context.clearCookies();
    await page.goto("/", { waitUntil: "networkidle" });

    // Act
    await page.getByTestId("consent-open-settings").click();
    await expect(page.getByTestId("consent-analytics")).not.toBeChecked();
    await page.getByTestId("consent-analytics").check();
    await page.getByTestId("consent-save").click();
    const stored = (await context.cookies()).find((c) => c.name === "hf-consent");
    const pushed = await page.evaluate(() =>
      (window.dataLayer ?? []).filter(
        (entry) => (entry as { event?: string }).event === "consent_update",
      ),
    );

    // Assert
    const value = JSON.parse(decodeURIComponent(stored?.value ?? "{}")) as Record<string, unknown>;
    expect(value).toMatchObject({ analytics: true, marketing: false, version: "2.0" });
    expect(value.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // `objectContaining`: a real container stamps its own `gtm.uniqueEventId`
    // onto every event it processes, which is GTM working, not a difference.
    expect(pushed).toContainEqual(
      expect.objectContaining({ event: "consent_update", analytics: true, marketing: false }),
    );
  });

  test("an Accept given to the old banner is asked again", async ({ page, context }) => {
    // Arrange — the round-28 banner never mentioned analytics or advertising.
    await context.clearCookies();
    await context.addCookies([
      { name: "hf-consent", value: "all", domain: "localhost", path: "/" },
    ]);

    // Act
    await page.goto("/", { waitUntil: "networkidle" });

    // Assert
    await expect(page.getByTestId("cookie-consent")).toBeVisible();
  });
}

import { expect, test, type BrowserContext } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";

/**
 * THE LAWYER'S DOCUMENTS, WHERE THEY BELONG (2026-10-19).
 *
 * The WORDS are proven by `lib/content/__tests__/legalDocuments.test.tsx`,
 * which compares the rendered text with the lawyer's files. This file proves
 * what only a browser can: the pages are reachable, the language notice
 * appears for exactly the readers it is for, the PDF is really served, the
 * rules attachment is where signup links to, and a wide table does not push
 * the page sideways on a phone.
 *
 * Every assertion waits on `legal-document`, which only the real page renders —
 * the root `loading.tsx` makes `page.goto` resolve while a skeleton is up.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function useLocale(context: BrowserContext, locale: "cs" | "en") {
  await context.addCookies([{ name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" }]);
}

test("the terms are the lawyer's Czech document, with its rules attachment", async ({
  page,
  context,
}) => {
  // Arrange
  await useLocale(context, "cs");

  // Act
  await page.goto("/terms#pravidla");

  // Assert
  await expect(page.getByTestId("legal-document")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Obchodní podmínky" })).toBeVisible();
  await expect(page.locator("#pravidla")).toHaveText("Příloha 1 – Pravidla komunity a hry");
  await expect(page.getByTestId("legal-czech-notice")).toHaveCount(0);
});

test("a reader of another language is told which text binds", async ({ page, context }) => {
  // Arrange
  await useLocale(context, "en");

  // Act
  await page.goto("/privacy");

  // Assert
  await expect(page.getByTestId("legal-document")).toBeVisible();
  await expect(page.getByTestId("legal-czech-notice")).toContainText(
    "The Czech text is the legally binding version",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Zásady zpracování osobních údajů" }),
  ).toBeVisible();
});

test("the privacy page is the real policy, not the draft", async ({ page }) => {
  // Act
  await page.goto("/privacy");

  // Assert
  await expect(page.getByTestId("legal-document")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/DRAFT/);
  await expect(page.getByTestId("legal-document")).toContainText("privacy@hrajfotbal.com");
});

test("the terms PDF is served", async ({ page, request }) => {
  // Arrange
  await page.goto("/terms");
  const href = await page.getByTestId("legal-pdf").getAttribute("href");

  // Act
  const response = await request.get(href ?? "");

  // Assert
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
});

test("a wide table scrolls inside its box, not the page", async ({ page }) => {
  // Act
  await page.goto("/privacy");
  await expect(page.getByTestId("legal-document")).toBeVisible();

  // Assert
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

/*
 * ~~"…and the operator"~~ — the operator block left every page on 2026-10-27
 * (owner's ruling; Obchodní podmínky 1.2 carries it). This pins the removal.
 */
test("the footer carries the four legal links and no operator block", async ({ page, context }) => {
  // Arrange
  await useLocale(context, "cs");

  // Act
  await page.goto("/games");
  const footer = page.getByTestId("site-footer");
  await footer.scrollIntoViewIfNeeded();

  // Assert
  for (const href of ["/terms", "/privacy", "/cookies", "/contact"]) {
    await expect(footer.locator(`a[href="${href}"]`)).toHaveCount(1);
  }
  await expect(page.getByTestId("footer-operator")).toHaveCount(0);
  await expect(footer).not.toContainText("Provozovatel");
  await expect(footer).not.toContainText("Česká obchodní inspekce");
  await expect(footer).not.toContainText("support@hrajfotbal.com");
  await expect(footer).toContainText("© Playllu");
  await expect(footer).not.toContainText(/hrajsport/i);
});

/*
 * ~~"the home page says who is, and is not, on the pitch"~~ — the owner removed
 * the lawyer's item 1.4 note from the home page on 2026-10-27. The message
 * still reaches every player at sign-up and at booking; this pins the removal.
 */
test("the home page no longer carries the who-is-on-the-pitch note", async ({ page, context }) => {
  // Arrange
  await useLocale(context, "cs");

  // Act
  await page.goto("/");
  await expect(page.getByTestId("how-it-works")).toBeVisible();

  // Assert
  await expect(page.getByTestId("how-it-works-note")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Zápasy ale neorganizujeme", { useInnerText: true });
});

import { expect, test } from "@playwright/test";
import { players, signInAs } from "./helpers/session";

/**
 * `/contact` — the operator's details (the lawyer's brief, item 1.1), and the
 * store behind the owner's own contact list (round 13, item 18).
 *
 * ~~The footer's Contact DIALOG~~ became a page on 2026-10-19: the brief asks
 * for a Kontakt page linked from every footer. What round 13 built survives on
 * it — the addresses and numbers the owner sets in `/admin` are listed there
 * without a deploy.
 *
 *   AN EMPTY PHONE LIST RENDERS NO PHONE. Not an empty heading, not "none
 *   listed" — the owner may simply not publish a number, and today he does
 *   not.
 */

test.use({ viewport: { width: 390, height: 844 } });

test("the footer's Contact link opens the operator's details", async ({ page }) => {
  // Arrange
  await page.goto("/games");
  const footer = page.getByTestId("site-footer");
  await footer.scrollIntoViewIfNeeded();

  // Act
  await footer.getByRole("link", { name: /^(Contact|Kontakt|Контакт)$/ }).click();

  // Assert
  await page.waitForURL(/\/contact$/);
  const operator = page.getByTestId("contact-operator");
  await expect(operator).toContainText("Playllu");
  await expect(operator).toContainText("info@playllu.com");
  await expect(operator).toContainText("privacy@hrajfotbal.com");
  await expect(operator.locator('a[href^="https://coi.gov.cz/"]')).toHaveCount(1);
});

test("an admin edits the contact details and the contact page follows", async ({
  page,
  context,
}) => {
  await signInAs(context, players.organizer);

  await page.goto("/admin/site", { waitUntil: "networkidle" });
  const emails = page.getByTestId("contact-emails-input");
  const phones = page.getByTestId("contact-phones-input");

  const previousEmails = await emails.inputValue();
  const previousPhones = await phones.inputValue();

  try {
    await emails.fill("first@e2e.test\nsecond@e2e.test");
    await phones.fill("+420 111 222 333");
    await page.getByTestId("contact-save").click();
    await expect(page.getByTestId("contact-saved")).toBeVisible();

    await page.goto("/contact");
    await expect(page.getByTestId("contact-emails").locator("li")).toHaveCount(2);
    await expect(page.getByTestId("contact-phones").locator("li")).toHaveCount(1);
    await expect(page.getByTestId("contact-phones")).toContainText("+420 111 222 333");

    // AN EMPTY PHONE LIST SHOWS NO PHONE SECTION AT ALL.
    await page.goto("/admin/site", { waitUntil: "networkidle" });
    await page.getByTestId("contact-phones-input").fill("");
    await page.getByTestId("contact-save").click();
    await expect(page.getByTestId("contact-saved")).toBeVisible();

    await page.goto("/contact");
    await expect(page.getByTestId("contact-operator")).toBeVisible();
    await expect(page.getByTestId("contact-phones")).toHaveCount(0);
    await expect(page.getByTestId("contact-emails")).toBeVisible();
  } finally {
    // The seed tableau is left exactly as it was found.
    await page.goto("/admin/site", { waitUntil: "networkidle" });
    await page.getByTestId("contact-emails-input").fill(previousEmails);
    await page.getByTestId("contact-phones-input").fill(previousPhones);
    await page.getByTestId("contact-save").click();
  }
});

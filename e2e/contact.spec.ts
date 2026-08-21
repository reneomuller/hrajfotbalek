import { expect, test } from "@playwright/test";
import { players, signInAs } from "./helpers/session";

/**
 * ROUND 13 ITEM 18 — the Contact control, and the store behind it.
 *
 * TWO THINGS ARE ASSERTED THAT A SCREENSHOT CANNOT SHOW.
 *
 *   THE DIALOG IS REACHABLE. `z-50` is a rank WITHIN a stacking context and
 *   the page shells here are `relative z-10`, which caps everything inside
 *   them below the nav pill at `fixed z-40`. A dialog rendered in place looks
 *   perfect and cannot be clicked. `elementFromPoint` at the close button's
 *   centre is the codebase's standing diagnostic for that family, and it is
 *   what this asserts.
 *
 *   AN EMPTY PHONE LIST RENDERS NO PHONE. Not an empty heading, not "none
 *   listed" — the owner may simply not publish a number.
 */

test.use({ viewport: { width: 390, height: 844 } });

test("the footer's Contact opens a dialog that is actually on top", async ({ page }) => {
  await page.goto("/games", { waitUntil: "networkidle" });

  await page.getByTestId("contact-open").scrollIntoViewIfNeeded();
  await page.getByTestId("contact-open").click();

  const dialog = page.getByTestId("contact-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("contact-emails").locator("li")).not.toHaveCount(0);

  /*
   * THE REACHABILITY CHECK. Visible, enabled and permanently covered is the
   * failure this catches, and it is invisible to every other kind of test.
   */
  const onTop = await page.getByTestId("contact-close").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el.contains(hit) || el === hit;
  });
  expect(onTop, "the close button is covered by page chrome").toBe(true);

  // Escape closes it, which is the keyboard half of a dialog.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("an admin edits the contact details and the footer follows", async ({ page, context }) => {
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

    await page.goto("/games", { waitUntil: "networkidle" });
    await page.getByTestId("contact-open").click();
    await expect(page.getByTestId("contact-emails").locator("li")).toHaveCount(2);
    await expect(page.getByTestId("contact-phones").locator("li")).toHaveCount(1);
    await expect(page.getByTestId("contact-dialog")).toContainText("+420 111 222 333");

    // AN EMPTY PHONE LIST SHOWS NO PHONE SECTION AT ALL.
    await page.goto("/admin/site", { waitUntil: "networkidle" });
    await page.getByTestId("contact-phones-input").fill("");
    await page.getByTestId("contact-save").click();
    await expect(page.getByTestId("contact-saved")).toBeVisible();

    await page.goto("/games", { waitUntil: "networkidle" });
    await page.getByTestId("contact-open").click();
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

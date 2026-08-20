import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";

/**
 * REDESIGN v2, ROUND 5 — login and signup.
 *
 * `docs/redesign-v2/strips/auth/`.
 *
 * TWO THINGS ARE ASSERTED RATHER THAN PHOTOGRAPHED, and both are omissions:
 *
 *   1. NO GOOGLE BUTTON. p08 draws `Continue with Google` and `Sign up with
 *      Google`; there is no Google OAuth in this product. A button that cannot
 *      sign anyone in is worse than no button, and this is the spec that fails
 *      when a later round paints one from the frame without wiring it.
 *   2. FORGOT-PASSWORD STILL WORKS. p08 draws a `Forgot your password?` link
 *      to a screen that does not exist — the audit lists both reset frames as
 *      missing (§3a item 2). The owner's instruction was to leave the working
 *      code path in its current style rather than invent one, so the two-step
 *      request-a-code form must still be on the page and still be a form.
 *
 * The rest is the card language p08 and p09 share with the redesigned pages:
 * a lifted panel around each field stack, `eyebrow` labels, capsule controls.
 */

const OUT = path.resolve(process.cwd(), "docs/redesign-v2/strips/auth");

test.use({ viewport: { width: 390, height: 844 } });

async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });
}

test("login and signup, in three languages", async ({ page, context }) => {
  mkdirSync(OUT, { recursive: true });

  for (const locale of ["en", "cs", "ru"] as const) {
    await context.clearCookies();
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
    ]);

    await page.goto("/login", { waitUntil: "networkidle" });
    await settle(page);
    await page.screenshot({ path: path.join(OUT, `01-login-${locale}.png`), fullPage: true });

    await page.goto("/signup", { waitUntil: "networkidle" });
    await settle(page);
    await page.screenshot({ path: path.join(OUT, `02-signup-${locale}.png`), fullPage: true });
  }
});

test("no Google control ships before Google OAuth does", async ({ page, context }) => {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);

  for (const url of ["/login", "/signup"]) {
    await page.goto(url, { waitUntil: "networkidle" });
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body, `${url} offers a Google control with nothing behind it`).not.toContain(
      "google",
    );
  }
});

test("the recovery path is still a working form, not a link to nowhere", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  await page.goto("/login", { waitUntil: "networkidle" });
  await settle(page);

  // Its own email field and its own submit, in a second <form> — the two-step
  // that predates the redesign and was not touched by it.
  const email = page.getByTestId("otp-email");
  const submit = page.getByTestId("request-code");
  await expect(email).toBeVisible();
  await expect(submit).toBeVisible();
  await expect(email).toHaveAttribute("type", "email");

  const sameForm = await page.evaluate(() => {
    const e = document.querySelector('[data-testid="otp-email"]') as HTMLInputElement;
    const b = document.querySelector('[data-testid="request-code"]') as HTMLButtonElement;
    return e.form !== null && e.form === b.form;
  });
  expect(sameForm, "the recovery field and its button are not one form").toBe(true);
});

/**
 * THE CARD LANGUAGE, AND THE LABELS THAT LOST THEIR MONO FACE.
 *
 * JetBrains Mono appears in none of the nineteen frames; the field labels were
 * set in it because the constant was copied between the two forms and never
 * questioned. Asserted because a mono label is invisible in a screenshot
 * review at this size.
 */
test("the auth forms use the product's panel and label treatment", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  await page.goto("/login", { waitUntil: "networkidle" });
  await settle(page);

  const label = await page
    .locator(".field-label")
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { family: s.fontFamily, transform: s.textTransform };
    });
  expect(label.family, "a mono face survives on a field label").not.toContain("JetBrains");
  expect(label.transform).toBe("uppercase");

  // Every primary control on the page is a capsule (p08).
  const radii = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="login-submit"], [data-testid="request-code"], [data-testid="login-signup-link"]')).map(
      (el) => {
        const r = el.getBoundingClientRect();
        return parseFloat(getComputedStyle(el).borderTopLeftRadius) / r.height;
      },
    ),
  );
  expect(radii.length).toBe(3);
  for (const ratio of radii) expect(ratio).toBeGreaterThanOrEqual(0.45);

  await page.locator("form").first().screenshot({ path: path.join(OUT, "03-sign-in-card.png") });
});

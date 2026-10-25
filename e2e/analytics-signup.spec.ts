import { expect, test } from "@playwright/test";

/**
 * ROUND 40 — the `sign_up` event (the analytics plan's step 7).
 *
 * The account is created server-side, so the redirect that follows it carries
 * `?signed_up=1`; a client component pushes `{event:'sign_up'}` once and strips
 * the flag, so a refresh cannot count the same sign-up twice.
 *
 * Registered only when the test server has a GTM container, because without
 * one the component is not mounted at all (and must not be).
 */
const gtmOn = /^GTM-[A-Z0-9]{4,}$/.test((process.env.NEXT_PUBLIC_GTM_ID ?? "").trim());

if (gtmOn) {
  test("a new account is reported to GTM exactly once, and a refresh adds nothing", async ({ page }) => {
    // Arrange
    const signUps = () =>
      page.evaluate(
        () =>
          ((window as unknown as { dataLayer?: { event?: string }[] }).dataLayer ?? []).filter(
            (entry) => entry?.event === "sign_up",
          ).length,
      );

    // Act
    await page.goto("/?signed_up=1", { waitUntil: "domcontentloaded" });
    await expect.poll(signUps, { message: "sign_up never reached the dataLayer" }).toBe(1);
    const urlAfter = page.url();
    await page.reload({ waitUntil: "domcontentloaded" });

    // Assert
    expect(urlAfter, "the flag was left in the address bar").not.toContain("signed_up");
    expect(await signUps(), "a refresh reported the sign-up again").toBe(0);
  });
}

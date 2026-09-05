import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKOUT_UI_MODE } from "@/lib/payments/embeddedCheckout";

/**
 * THE CHECK THAT WAS MISSING WHEN THE CHECKOUT WENT DOWN.
 *
 * API version 2026-08-26 renamed `ui_mode: "embedded"` to `"embedded_page"`.
 * Every suite passed, `tsc` was clean, and the first real session creation on
 * production answered `StripeInvalidRequestError` on `param: ui_mode`.
 *
 * IT COMPILED BECAUSE THE UNION IS OPEN. The SDK declares
 * `'elements' | 'embedded_page' | 'form' | 'hosted_page' | OtherString`, and
 * that last member widens the whole thing to `string` — deliberately, so a
 * newer API value does not fail an older SDK's build. The cost is that the
 * compiler cannot tell a valid value from a typo, and this is the one field
 * where being wrong takes payments offline.
 *
 * SO THE TEST READS THE SDK'S OWN DECLARATION and asserts our literal is a
 * member of it. No key, no network, no live call — it fails on `npm install`
 * of a Stripe version that renames the value again, which is exactly when
 * somebody needs to be told.
 */

function declaredUiModes(): string[] {
  const types = path.join(
    process.cwd(),
    "node_modules/stripe/cjs/resources/Checkout/Sessions.d.ts",
  );
  const source = readFileSync(types, "utf8");
  const match = source.match(/type UiMode = ([^;]+);/);
  if (!match) throw new Error("the SDK no longer declares a UiMode union here");

  return match[1]!
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("'") || part.startsWith('"'))
    .map((part) => part.slice(1, -1));
}

describe("the checkout ui_mode", () => {
  it("is a value the installed Stripe SDK declares", () => {
    // Arrange
    const declared = declaredUiModes();

    // Act / Assert
    expect(
      declared,
      `the SDK declares ${declared.join(", ")} — "${CHECKOUT_UI_MODE}" is not one of them`,
    ).toContain(CHECKOUT_UI_MODE);
  });

  it("is the EMBEDDED one, not the hosted or elements variants", () => {
    // Arrange / Act / Assert — the value is right for the right reason: this
    // product renders the form inside its own page. `hosted_page` would send
    // the player to stripe.com, which is the flow round 25 replaced.
    expect(CHECKOUT_UI_MODE).toContain("embedded");
  });

  it("catches the rename that took production down", () => {
    /*
     * The regression, stated as itself. `embedded` was valid until API version
     * 2026-08-26 and is not valid on the version this repo pins, so it must
     * not be what we send.
     */
    expect(declaredUiModes()).not.toContain("embedded");
    expect(CHECKOUT_UI_MODE).not.toBe("embedded");
  });
});

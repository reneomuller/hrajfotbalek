import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKOUT_LINK_DISPLAY } from "@/lib/payments/embeddedCheckout";

/**
 * ROUND 36, ITEM 1 — what a Checkout Session can and cannot say about wallets.
 *
 * TWO JOBS, AND THE SECOND IS THE UNUSUAL ONE.
 *
 * The first is `uiMode.test.ts`'s job repeated for a new field: `wallet_options`
 * reached production untested against a live call, because the secret key is
 * not retrievable outside Vercel — `vercel env pull` returns `[SENSITIVE]` for
 * it — so no session can be created locally at all. The ONE field where being
 * wrong takes payments offline has already done so once, on `ui_mode`, and the
 * defence that worked then is reading the SDK's own declaration.
 *
 * The second is to PIN THE ABSENCE. Item 1 asked which layer renders Apple Pay
 * twice, and the answer rests on there being no session parameter that could —
 * a claim about something not existing, which is exactly the kind that rots
 * silently when a dependency is upgraded. If a future Stripe version adds an
 * express-checkout or wallet-placement parameter, this test fails and tells
 * whoever is reading that the round-36 conclusion is worth revisiting.
 */

function sessionTypes(): string {
  return readFileSync(
    path.join(process.cwd(), "node_modules/stripe/cjs/resources/Checkout/Sessions.d.ts"),
    "utf8",
  );
}

describe("the checkout wallet options", () => {
  it("sets Link's display to a value the installed SDK declares", () => {
    // Arrange
    const match = sessionTypes().match(/namespace Link \{\s*type Display = ([^;]+);/);
    expect(match, "the SDK no longer declares a Link.Display union here").not.toBeNull();

    // Act
    const declared = match![1]!
      .split("|")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("'") || part.startsWith('"'))
      .map((part) => part.slice(1, -1));

    // Assert
    expect(
      declared,
      `the SDK declares ${declared.join(", ")} — "${CHECKOUT_LINK_DISPLAY}" is not one of them`,
    ).toContain(CHECKOUT_LINK_DISPLAY);
  });

  it("is the ONLY wallet a session can speak about", () => {
    /*
     * THE EVIDENCE BEHIND ITEM 1'S ANSWER, held as an assertion.
     *
     * `SessionCreateParams.WalletOptions` has one member. If it grows an
     * `apple_pay` or a `google_pay`, the finding that the duplicate is
     * Stripe-internal stops being true and somebody should look again.
     */
    const source = sessionTypes();
    const block = source.match(
      /interface WalletOptions \{[\s\S]*?\n(\s*)\}/g,
    );
    expect(block, "the SDK no longer declares a WalletOptions interface").not.toBeNull();

    const mentionsAWallet = /interface WalletOptions \{[\s\S]*?(apple_pay|google_pay)/.test(source);
    expect(
      mentionsAWallet,
      "Stripe now exposes a wallet beyond Link on Checkout Sessions — round 36 " +
        "item 1 concluded the Apple Pay duplicate was uncontrollable from here, " +
        "and that conclusion needs re-testing",
    ).toBe(false);
  });

  it("has no express-checkout or wallet-placement parameter at all", () => {
    /*
     * The other half of the same claim. Apple Pay's POSITION in the embedded
     * form is Stripe's layout, not a parameter — asserted so an upgrade that
     * adds one is noticed.
     */
    const source = sessionTypes();
    expect(
      /express_checkout|expressCheckout|wallet_placement|payment_layout/i.test(source),
      "Stripe now exposes a layout or express-checkout parameter on Checkout " +
        "Sessions — the round-36 conclusion is worth revisiting",
    ).toBe(false);
  });
});

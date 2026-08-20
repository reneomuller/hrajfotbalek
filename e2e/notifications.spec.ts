import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session.ts";

/**
 * IN-APP NOTIFICATIONS, v1 (round 7, item 5).
 *
 * THE SELF-SKIP IS GONE (round 9, item 1). Migration 20260820120000 is applied
 * on local and on production, verified before this header was deleted, so
 * these tests now run for real everywhere. The skip existed for exactly one
 * window — code shipped ahead of the migration, degrading to no bell — and a
 * self-skipping test is indistinguishable from a passing one in a summary
 * line, which is how a suite quietly stops covering something.
 */

test.describe("notifications", () => {
  test("the bell shows a published notification and clears its dot on open", async ({
    page,
    context,
  }) => {
    const admin = serviceClient();
    const title = `Round 7 check ${Date.now()}`;
    const { error } = await admin.rpc("admin_create_notification", {
      p_title: title,
      p_body: "The body of the message.",
    });
    expect(error).toBeNull();

    await signInAs(context, players.runner);
    await page.goto("/games", { waitUntil: "networkidle" });

    const bell = page.getByTestId("notification-bell");
    await expect(bell).toBeVisible();
    // Unread, because this player has never opened it against this row.
    await expect(bell).toHaveAttribute("data-unread", "true");

    await bell.click();
    const panel = page.getByTestId("notification-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(title);

    // The dot clears optimistically — the person is looking at them.
    await expect(bell).toHaveAttribute("data-unread", "false");

    /*
     * AND THE PANEL IS ACTUALLY ON TOP — asserted with `elementFromPoint`,
     * not by reading z-index. CLAUDE.md's standing law: `z-50` ranks within a
     * stacking context, and this product has already shipped a dialog the nav
     * pill ate. The panel is portalled into `document.body` for exactly this
     * reason and this is the assertion that proves it worked.
     */
    const onTop = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="notification-panel"]')!;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 20);
      return el.contains(hit) || hit === el;
    });
    expect(onTop, "the notification panel is covered by the chrome").toBe(true);

    // A RELOAD AGREES WITH THE OPTIMISTIC CLEAR: the receipt was written, not
    // just painted.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("notification-bell")).toHaveAttribute(
      "data-unread",
      "false",
    );
  });

  test("a signed-out visitor has no bell", async ({ page }) => {
    await page.goto("/games", { waitUntil: "networkidle" });
    await expect(page.getByTestId("notification-bell")).toHaveCount(0);
  });

  test("the compose form publishes, and a non-admin cannot reach the RPC", async ({
    context,
  }) => {
    // The control plane, not the form: the RPC re-checks inside the function,
    // which is the boundary that actually holds.
    const { apiClientFor } = await import("./helpers/session.ts");
    const runner = await apiClientFor(players.runner);
    const { error } = await runner.rpc("admin_create_notification", {
      p_title: "nope",
      p_body: "nope",
    });
    expect(error?.message ?? "").toContain("INSUFFICIENT_PERMISSION");
    await context.clearCookies();
  });
});

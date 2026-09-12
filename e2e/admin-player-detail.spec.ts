import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session.ts";

/**
 * THE ADMIN PLAYER PAGE (round 7, item 9).
 *
 * `/admin/players` rows have always opened this page; what round 7 adds is the
 * own-profile composition and an ADMIN ACTIONS panel holding the controls that
 * used to sit on the list rows — interleaved with the facts, on a list people
 * scroll fast, where the thing you could accidentally tap sat between two
 * things you were only reading.
 *
 * THE NOTE IS THE ASSERTION THAT MATTERS. A credit grant is money appearing in
 * a wallet with no booking behind it, and the ledger row it writes is the only
 * record of why. Asserted past the browser, because `required` on an input is
 * skipped by anything that is not one and this action is a POST endpoint.
 */


test.use({ viewport: { width: 390, height: 844 } });

/** The seeded player this suite reads; any real row would do. */
async function anyPlayerId(): Promise<string> {
  const admin = serviceClient();
  const { data } = await admin
    .from("players")
    .select("id")
    .eq("id", players.runner.id)
    .single();
  return data!.id;
}

test("the player page carries the profile shape, contact and the actions panel", async ({
  page,
  context,
}) => {
  await signInAs(context, players.organizer);
  const id = await anyPlayerId();

  await page.goto(`/admin/players/${id}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  // The own-profile composition: face, three figures.
  await expect(page.getByTestId("admin-player-avatar")).toBeVisible();
  await expect(page.getByTestId("admin-player-stats")).toBeVisible();
  await expect(page.getByTestId("admin-player-games-played")).toBeVisible();
  await expect(page.getByTestId("admin-player-balance")).toBeVisible();

  // Contact — the reason an organizer opens this page at all.
  await expect(page.getByTestId("admin-player-email")).toBeVisible();
  await expect(page.getByTestId("admin-player-phone")).toBeVisible();

  // The panel, and the two actions item 9 names. The credit form is behind a
  // disclosure — a money control should take a deliberate tap to appear.
  const panel = page.getByTestId("admin-actions");
  await expect(panel).toBeVisible();
  // `make-admin` or `revoke-admin` depending on the row's current rights —
  // asserted as "one of them is here" so the test does not depend on which.
  const rights = panel.locator(
    '[data-testid="make-admin"], [data-testid="revoke-admin"]',
  );
  await expect(rights).toHaveCount(1);
  await panel.getByTestId("grant-credit-open").click();
  await expect(panel.getByTestId("grant-amount")).toBeVisible();
  await expect(panel.getByTestId("grant-note")).toBeVisible();

  });

test("a credit grant without a note is refused on the server", async ({ page, context }) => {
  await signInAs(context, players.organizer);
  const id = await anyPlayerId();
  const admin = serviceClient();

  const balanceBefore = async () => {
    const { data } = await admin
      .from("credit_ledger")
      .select("delta_czk")
      .eq("player_id", id);
    return (data ?? []).reduce((sum, row) => sum + row.delta_czk, 0);
  };

  const before = await balanceBefore();

  await page.goto(`/admin/players/${id}`, { waitUntil: "networkidle" });
  await page.getByTestId("grant-credit-open").click();
  // CREDITS since round 31, item 3 — the field takes whole games, not crowns.
  await page.getByTestId("grant-amount").fill("1");

  // Defeat the browser gate so the submission actually reaches the action —
  // the point is that the SERVER refuses, not that the attribute exists.
  await page.evaluate(() => {
    document.querySelector('[data-testid="grant-note"]')!.removeAttribute("required");
  });
  await page.getByTestId("grant-submit").click();

  await expect(page.locator("body")).toContainText(/note is required/i);

  // AND NO LEDGER ROW WAS WRITTEN. The message could be right while the grant
  // went through, which is the failure that would actually cost money.
  expect(await balanceBefore(), "a note-less grant still moved the balance").toBe(before);
});

test("a credit grant with a note writes a ledger row carrying it", async ({
  page,
  context,
}) => {
  await signInAs(context, players.organizer);
  const id = await anyPlayerId();
  const admin = serviceClient();

  const note = `round7 check ${Date.now()}`;

  await page.goto(`/admin/players/${id}`, { waitUntil: "networkidle" });
  await page.getByTestId("grant-credit-open").click();
  /*
   * TWO CREDITS, WHICH MUST LAND AS 300 CZK — the owner's own acceptance
   * numbers for round 31 item 3. The field speaks credits; the ledger keeps
   * crowns, and this is the assertion that ties the two rates together.
   */
  await page.getByTestId("grant-amount").fill("2");
  await page.getByTestId("grant-note").fill(note);
  await page.getByTestId("grant-submit").click();

  // Asserted on the LEDGER, not on the screen. A client-state success marker
  // does not survive `revalidatePath`, and the row is the thing that matters.
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("credit_ledger")
        .select("delta_czk,reason")
        .eq("player_id", id)
        .eq("delta_czk", 300)
        .eq("reason", "admin_grant");
      return (data ?? []).length;
    })
    .toBeGreaterThan(0);
});

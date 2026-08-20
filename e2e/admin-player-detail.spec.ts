import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
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

const OUT = path.resolve(process.cwd(), "docs/redesign-v2/strips/admin");

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
  mkdirSync(OUT, { recursive: true });
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

  await page.screenshot({ path: path.join(OUT, "01-player-detail.png"), fullPage: true });
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
  await page.getByTestId("grant-amount").fill("150");

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
  await page.getByTestId("grant-amount").fill("50");
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
        .eq("delta_czk", 50)
        .eq("reason", "admin_grant");
      return (data ?? []).length;
    })
    .toBeGreaterThan(0);
});

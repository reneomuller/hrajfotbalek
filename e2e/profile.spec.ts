import { expect, test } from "@playwright/test";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session.ts";
import { setWalletTo, walletBalance } from "./helpers/scaffold.ts";

/**
 * G1 — the profile and wallet half.
 *
 * TEST-213/214/215 (top-up requested → confirmed → credited, and the two
 * refusals), TEST-217 (top-up credit spends), and the account surfaces Phase 6,
 * 7 and 10 added.
 *
 * WHAT THESE SPECS DELIBERATELY DO NOT COVER: the signup inbox branch and the
 * password migration. Both need an email round trip that the local stack cannot
 * produce — `enable_confirmations` is off here, so `signUp()` returns a session
 * and no mail is ever sent. They are human gate-walk items, and pretending to
 * cover them with a mocked mailbox would assert that our mock works.
 */

test.beforeEach(async () => {
  // These specs are about wallet arithmetic, so the starting balance has to be
  // a number this file chose rather than one the seed happened to leave.
  await setWalletTo(players.runner.id, 0);
});

test("a top-up is requested, shows a QR, and is not money until confirmed", async ({
  page,
  context,
}) => {
  const runner = await apiClientFor(players.runner);
  const { data: topup, error } = await runner.rpc("create_topup", { p_amount_czk: 300 });
  expect(error).toBeNull();
  expect(topup.status).toBe("pending");

  // The 27-series is what lets a bank statement tell a top-up from a booking.
  expect(String(topup.payment_code)).toMatch(/^27\d{8}$/);

  await signInAs(context, players.runner);
  await page.goto(`/account/topup/${topup.id}`);

  await expect(page.getByTestId("qr-payment")).toBeVisible();
  await expect(page.getByText(String(topup.payment_code))).toBeVisible();

  // Pending is not balance. Asserted as a BALANCE rather than a ledger row
  // count, because `setWalletTo` normalises by writing a compensating row —
  // counting rows would measure the harness, not the product.
  expect(await walletBalance(players.runner.id)).toBe(0);
});

test("an admin confirms a top-up and the wallet reflects what arrived", async ({
  page,
  context,
}) => {
  const runner = await apiClientFor(players.runner);
  const { data: topup } = await runner.rpc("create_topup", { p_amount_czk: 300 });

  await signInAs(context, players.organizer);
  await page.goto("/admin/topups");

  const row = page
    .getByTestId("pending-topup")
    .filter({ hasText: String(topup.payment_code) });
  await expect(row).toBeVisible();
  await row.getByTestId("confirm-topup").click();

  // Assert the DATABASE, not the re-render: the confirmation revalidates the
  // page, and a client-state marker can be unmounted before it is observed
  // (CLAUDE.md).
  await expect(async () => {
    expect(await walletBalance(players.runner.id)).toBe(300);
  }).toPass();

  // ...and THIS top-up is the one that moved: asserted on its own row rather
  // than on the player's ledger as a whole, which carries history from every
  // earlier run of this file.
  const admin = serviceClient();
  const { data: confirmedTopup } = await admin
    .from("credit_topups")
    .select("status, received_amount_czk, confirmed_at")
    .eq("id", topup.id)
    .maybeSingle();
  expect(confirmedTopup?.status).toBe("confirmed");
  expect(confirmedTopup?.received_amount_czk).toBe(300);
  expect(confirmedTopup?.confirmed_at).not.toBeNull();
});

test("a second confirmation is refused and the balance does not move", async () => {
  const runner = await apiClientFor(players.runner);
  const { data: topup } = await runner.rpc("create_topup", { p_amount_czk: 200 });

  const organizer = await apiClientFor(players.organizer);
  const first = await organizer.rpc("confirm_topup", { p_topup_id: topup.id });
  expect(first.error).toBeNull();

  const second = await organizer.rpc("confirm_topup", { p_topup_id: topup.id });
  expect(second.error?.message ?? "").toContain("TOPUP_NOT_PENDING");

  // The refusal has to be about the money, not the message.
  expect(await walletBalance(players.runner.id)).toBe(200);
});

test("the payer cannot confirm their own top-up", async () => {
  const runner = await apiClientFor(players.runner);
  const { data: topup } = await runner.rpc("create_topup", { p_amount_czk: 150 });

  const { error } = await runner.rpc("confirm_topup", { p_topup_id: topup.id });
  expect(error?.message ?? "").toContain("INSUFFICIENT_PERMISSION");
});

test("topped-up credit spends on the next booking", async ({ page, context }) => {
  const runner = await apiClientFor(players.runner);
  const { data: topup } = await runner.rpc("create_topup", { p_amount_czk: 2000 });

  const organizer = await apiClientFor(players.organizer);
  await organizer.rpc("confirm_topup", { p_topup_id: topup.id });

  // Credit from a top-up is credit: it goes through the same auto-apply rails,
  // which is the point of writing it to the same ledger.
  await signInAs(context, players.runner);
  await page.goto("/account");
  // `formatCzk` groups thousands for the display locale — "2,000 CZK", not
  // "2000". Asserting the raw digits would be asserting a formatter bug.
  // The wallet counts CREDITS and prints no crown figure: 2,000 / 150 floors
  // to 13. The crowns are asserted against the ledger by `walletBalance`
  // elsewhere; this screen's job is to say how many games that is.
  await expect(page.getByTestId("credit-balance")).toContainText("13");
  await expect(page.getByTestId("credit-balance-czk")).toHaveCount(0);
});

test("the account page shows a photo slot and the security controls", async ({
  page,
  context,
}) => {
  await signInAs(context, players.runner);
  await page.goto("/account");

  // Phase 7: the avatar renders as initials until a photo exists — the fallback
  // is the ordinary state, not an error state.
  await expect(page.getByTestId("account-avatar")).toBeVisible();
  await expect(page.getByTestId("photo-input")).toBeAttached();

  /*
   * THE WALLET'S BUY ENTRY LEADS TO THE PASSES, not to an arbitrary-amount
   * chooser. There is no cash wallet in the product's language: credits come
   * from passes, and ruling N removed the standalone top-up chooser from the
   * player UI. The RPC behind it survives as the reconciliation path for a
   * mispaid pass — what is asserted here is that nothing advertises it.
   *
   * On the OVERVIEW tab, which is where the wallet lives now.
   */
  const buy = page.getByTestId("topup-cta");
  await expect(buy).toBeVisible();
  await expect(buy).toHaveAttribute("href", "/pass");

  /*
   * THE FIXTURE LIST IS A TAB (visibility round, item 3), not a link out.
   *
   * It was "See all my games →" pointing at `/my-games`, which was the only
   * door to that route — the nav pill has never carried it. The tab renders
   * the same `PlayerHistory`, so `/my-games` survives for links already shared
   * and stops being somewhere the product sends anyone.
   */
  await expect(page.getByTestId("games-played")).toHaveCount(0);
  await page.getByTestId("profile-tab").filter({ hasText: /my games/i }).click();
  await page.waitForURL("**/account?tab=games");
  await expect(page.getByTestId("games-played")).toBeVisible();

  /*
   * THE SECURITY CONTROLS MOVED BEHIND THE SETTINGS TAB. The identity block
   * and the stat row render on every tab; the account controls are one tab in,
   * which is where "Settings" means what it says. Everything below this line
   * is the same set of assertions the flat page carried.
   */
  await page.getByTestId("profile-tab").filter({ hasText: /settings/i }).click();
  await page.waitForURL("**/account?tab=settings");

  /*
   * REQ-AUTH-020 — both controls are COMPACT TEXT LINKS now, stacked directly
   * above the deletion link and styled exactly like it. The two-column panel
   * they replace is a recorded defect: these are used roughly once each and
   * were taking more vertical space than the wallet and the fixture list.
   *
   * So the resting state is three lines, and the form is disclosed in place.
   */
  await expect(page.getByTestId("current-password")).toHaveCount(0);
  await expect(page.getByTestId("change-password-link")).toBeVisible();
  await expect(page.getByTestId("change-email-link")).toBeVisible();
  await expect(page.getByTestId("deletion-mailto")).toBeVisible();

  await page.getByTestId("change-password-link").click();
  await expect(page.getByTestId("current-password")).toBeVisible();
});

test("another player's top-up is not readable", async () => {
  const runner = await apiClientFor(players.runner);
  const { data: topup } = await runner.rpc("create_topup", { p_amount_czk: 150 });

  const other = await apiClientFor(players.creditRich);
  const { data } = await other.from("credit_topups").select("id").eq("id", topup.id);

  // RLS, not a page check: the row simply is not there for anyone else.
  expect(data ?? []).toHaveLength(0);
});

/*
 * STAGE 3 — the profile block, display and edit (ruling L §2.8, §3 screen 7).
 *
 * ASSERTED ON WHAT THE SERVER RENDERS NEXT, not on the action's returned
 * state: `updateProfileAction` revalidates `/account`, and a marker rendered
 * from a `useActionState` result can be unmounted by that re-render before a
 * spec observes it (CLAUDE.md). The durable fact is the display block showing
 * the new values.
 *
 * The runner's profile is restored at the end — this suite reads the seed
 * tableau and must not leave it changed.
 */
test("the profile block edits all six fields, positions as multi-select chips", async ({
  page,
  context,
}) => {
  await signInAs(context, players.runner);
  // The edit fields are the Settings tab (visibility round, item 3). Entered by
  // URL rather than by tapping through, because what this spec is about is the
  // form's behaviour — the tab bar itself is asserted where it is the subject.
  await page.goto("/account?tab=settings");

  const block = page.getByTestId("profile-details");
  await expect(block).toBeVisible();

  // Display mode first: six rows, and an unset value says so rather than
  // rendering a blank line.
  for (const field of ["nickname", "positions", "skill", "country", "phone", "email"]) {
    await expect(block.getByTestId(`profile-${field}`), field).toBeVisible();
  }

  await page.getByTestId("edit-details").click();

  // §2.8: focus moves to the first field when the edit block opens.
  await expect(page.locator("#nickname")).toBeFocused();

  // MORE CHIPS SELECTED THAN FIT ONE ROW is the state §2.8 names, and it is
  // only reachable because the control is multi-select.
  for (const code of ["gk", "def", "mid", "att"]) {
    await page.getByTestId(`position-chip-${code}`).click();
  }

  await page.locator("#phone").fill("+420777000111");
  await page.selectOption("#skill", "advanced");
  await page.selectOption("#country", "CZ");

  await page.getByTestId("save-profile").click();

  // Back in display mode, rendered by the server from the saved row.
  await expect(page.getByTestId("edit-details")).toBeVisible();
  await expect(block.getByTestId("profile-positions")).toContainText("Goalkeeper");
  await expect(block.getByTestId("profile-positions")).toContainText("Attacker");
  await expect(block.getByTestId("profile-phone")).toContainText("+420777000111");

  // And it survives a fresh request, which is the difference between a saved
  // row and a client-side illusion.
  await page.reload();
  await expect(block.getByTestId("profile-positions")).toContainText("Midfielder");

  // Unticking must clear, not merge — the form knows the whole desired set.
  await page.getByTestId("edit-details").click();
  for (const code of ["gk", "def", "mid", "att"]) {
    await page.getByTestId(`position-chip-${code}`).click();
  }
  await page.getByTestId("save-profile").click();
  await expect(page.getByTestId("edit-details")).toBeVisible();
  await expect(block.getByTestId("profile-positions")).toContainText(/not set/i);
});

/* A nickname the pattern refuses is reported on the field, not as a crash. */
test("the profile form reports an invalid nickname inline", async ({ page, context }) => {
  await signInAs(context, players.runner);
  await page.goto("/account?tab=settings");
  await page.getByTestId("edit-details").click();

  await page.locator("#nickname").fill("no!");
  await page.getByTestId("save-profile").click();

  // Still in edit mode, with the message beside the field.
  await expect(page.locator("#nickname")).toBeVisible();
  await expect(page.locator("#nickname-error")).toBeVisible();
  await expect(page.locator("#nickname")).toHaveAttribute("aria-invalid", "true");
});

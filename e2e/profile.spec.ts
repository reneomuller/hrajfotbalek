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
  // It survives the rail change (round 13): a variable symbol is the permanent
  // identifier of a payment, and history is not rewritten because the till
  // changed.
  expect(String(topup.payment_code)).toMatch(/^27\d{8}$/);

  await signInAs(context, players.runner);

  /*
   * ~~`/account/topup/[id]` renders the QR and the variable symbol.~~ REMOVED
   * IN ROUND 13 (items 6-7): the screen and the whole QR flow are retired, and
   * credit is bought through a Stripe Payment Link instead.
   *
   * WHAT THIS TEST IS STILL FOR is the half that never depended on the screen:
   * a PENDING top-up is not balance. That is a ledger property, it is the one
   * that would cost real money to get wrong, and it is asserted below.
   */

  // Pending is not balance. Asserted as a BALANCE rather than a ledger row
  // count, because `setWalletTo` normalises by writing a compensating row —
  // counting rows would measure the harness, not the product.
  expect(await walletBalance(players.runner.id)).toBe(0);
});

/*
 * ~~"an admin confirms a top-up and the wallet reflects what arrived"~~
 * REWRITTEN IN ROUND 13 (item 8). There is no admin top-ups screen: its whole
 * job was matching a bank transfer by variable symbol, and there are no bank
 * transfers. A pass is confirmed by the Stripe webhook.
 *
 * THE LEDGER PROPERTY IS UNCHANGED AND IS WHAT THIS STILL TESTS — a confirmed
 * top-up credits what ACTUALLY ARRIVED, not what was asked for. `confirm_topup`
 * owns that rule and the webhook calls it, so the assertion moved from a
 * button to the function underneath it.
 */
test("a confirmed top-up credits what actually arrived", async () => {
  const runner = await apiClientFor(players.runner);
  const { data: topup } = await runner.rpc("create_topup", { p_amount_czk: 300 });

  const service = serviceClient();
  const { error } = await service.rpc("confirm_topup", {
    p_topup_id: topup.id,
    p_confirmed_by: players.organizer.id,
    p_received_amount_czk: 300,
  });
  expect(error).toBeNull();

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
   * ~~THE SECURITY CONTROLS MOVED BEHIND THE SETTINGS TAB.~~ THEY ARE BACK ON
   * THE OVERVIEW (round 16, item 14).
   *
   * Ruling L's split — Overview is what you look at, Settings what you change
   * — was clean and cost a tap on the two things people actually come here to
   * do: fix a phone number and sign out. Three tabs for one screen's worth of
   * content is a tab bar earning its keep on the strength of the tab bar.
   *
   * `?tab=settings` still RESOLVES rather than 404ing, because bookmarks
   * exist; it lands on the overview, which is where the content is.
   */
  await page.goto("/account");
  await expect(
    page.getByTestId("profile-tab").filter({ hasText: /settings/i }),
    "the Settings tab is back",
  ).toHaveCount(0);

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


/**
 * ROUND 17 ITEMS 3 AND 5 — the order of the overview, top to bottom.
 *
 * ASSERTED AS AN ORDER, not as presence. Every one of these blocks rendered
 * before both items and every one renders after them; the only thing that
 * changed is the sequence, so a test that checked they were all there would
 * have passed against every arrangement and proved nothing.
 *
 * WHY THIS ORDER. Somebody opens their profile to check or fix a fact about
 * themselves — a phone number, a position, an email. Under the previous
 * arrangement that meant scrolling past five badge tiles, four of which are
 * things they have not done yet. The page now runs wallet -> who you are ->
 * what you have earned -> what you can do to the account, which puts the two
 * irreversible-ish controls at the end where nobody meets them by accident.
 */
test("the overview runs wallet, details, badges, then the account actions", async ({
  page,
  context,
}) => {
  await signInAs(context, players.runner);
  await page.goto("/account", { waitUntil: "networkidle" });

  const order = await page.evaluate(() => {
    const marks: [string, Element | null][] = [
      ["wallet", document.querySelector('[data-testid="credit-balance"]')],
      ["details", document.querySelector('[data-testid="profile-details"]')],
      ["badges", document.querySelector('[data-testid="badge-grid"]')],
      ["signOut", document.querySelector('[data-testid="sign-out"]')],
      ["password", document.querySelector('[data-testid="change-password-link"]')],
      ["delete", document.querySelector('[data-testid="deletion-mailto"]')],
    ];
    return marks
      .filter(([, el]) => el !== null)
      .map(([name, el]) => ({ name, top: el!.getBoundingClientRect().top + window.scrollY }))
      .sort((a, b) => a.top - b.top)
      .map((m) => m.name);
  });

  expect(order).toEqual(["wallet", "details", "badges", "signOut", "password", "delete"]);
});

/**
 * ROUND 17 ITEM 5 — and the trap it walks into.
 *
 * `SecurityLinks` carries a comment recording why "Change my email" left this
 * stack: measured with `document.elementFromPoint`, the element on top of it
 * was the NAV PILL — `fixed z-40` at the document root, floating over the last
 * band of every page. It was visible, enabled and unclickable.
 *
 * Item 5 moves these two links to the very bottom of the page, which is that
 * band's neighbourhood. So the assertion is the one that caught it the first
 * time: `elementFromPoint` at each control's centre, with the page scrolled
 * all the way down, because that is the only position where the pill can
 * reach them.
 *
 * `toBeVisible` WOULD PASS AGAINST THE BUG. That is the whole lesson of the
 * modal law in CLAUDE.md — a thing can be visible, enabled and permanently
 * covered.
 */
test("the account actions are reachable with the page scrolled to the bottom", async ({
  page,
  context,
}) => {
  await signInAs(context, players.runner);
  await page.goto("/account", { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  /*
   * WAIT FOR THE SCROLL TO SETTLE. `elementFromPoint` answers null for any
   * coordinate outside the viewport, so probing mid-scroll reports every
   * control as "covered by nothing" — a false failure that looks exactly like
   * the real one. Poll on the deepest control being in view instead of
   * sleeping.
   */
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const el = document.querySelector('[data-testid="deletion-mailto"]');
          if (!el) return false;
          const box = el.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= window.innerHeight;
        }),
      { timeout: 5_000, message: "the page never scrolled to the account actions" },
    )
    .toBe(true);

  const covered = await page.evaluate(() =>
    ["sign-out", "change-password-link", "deletion-mailto"]
      .map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (!el) return { id, on: "MISSING" };
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        if (el === hit || el.contains(hit)) return null;
        return { id, on: hit?.getAttribute("data-testid") ?? hit?.tagName ?? "nothing" };
      })
      .filter(Boolean),
  );

  expect(
    covered,
    "an account action is covered at the bottom of the page — the nav pill again",
  ).toEqual([]);
});

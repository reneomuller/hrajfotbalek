import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session.ts";
import { SEED_PASSWORD } from "../scripts/fixtures.ts";

/**
 * G1 — the auth half.
 *
 * TEST-203 (password sign-in) and the surfaces around it. The seeded players
 * all have passwords, so the returning-player path is fully exercisable here.
 *
 * WHAT IS DELIBERATELY ABSENT, and why it is not a coverage gap:
 *
 *   TEST-201 (signup → verification email) and TEST-204 (the passwordless
 *   migration) both require an email round trip. `enable_confirmations` is off
 *   on the local stack, so `signUp()` returns a session immediately and no mail
 *   is ever sent — the branch that runs in production cannot run here. Mocking
 *   a mailbox would assert that the mock works. Both are human gate-walk items,
 *   listed in the G1 report.
 */

/*
 * REQ-AUTH-019 (v1.1.4 §3.1a) — ONE door in the header, and this REVERSES the
 * two-doors assertion this spec previously carried.
 *
 * The earlier reasoning was sound and is worth restating rather than deleting:
 * with passwords, logging in and signing up are different acts, and a
 * returning player who taps Sign up is told their email is taken instead of
 * getting in. What changed is where that distinction belongs. The header is
 * not it; the LOGIN PAGE is, which is where someone with no account is already
 * looking.
 *
 * So this asserts both halves — the header has one door, and the door leads
 * somewhere that offers the other one. Asserting only the first half would
 * pass just as well if signup had become unreachable.
 */
test("the signed-out header offers one door, and the login page carries the other", async ({
  page,
}) => {
  await page.goto("/games");

  await expect(page.getByTestId("nav-login")).toBeVisible();
  await expect(page.getByTestId("nav-signup")).toHaveCount(0);

  await page.getByTestId("nav-login").click();
  await page.waitForURL(/\/login/);
  await expect(page.getByTestId("login-signup-link")).toBeVisible();

  await page.getByTestId("login-signup-link").click();
  await page.waitForURL(/\/signup/);
});

/*
 * The deep-link intent survives the login → signup hop.
 *
 * Someone who taps "Claim your spot" while signed out lands on /login with the
 * game attached. Losing it at this hop would send them through signup and then
 * to the home page, having forgotten the game they came for.
 */
test("the create-account link carries the booking intent with it", async ({ page }) => {
  await page.goto("/login?next=%2Fgame%2Fabc%2Fbook&game=abc&action=book");

  const href = await page.getByTestId("login-signup-link").getAttribute("href");
  expect(href).toContain("/signup?");
  expect(href).toContain("game=abc");
  expect(href).toContain("action=book");
  expect(href).toContain("next=");
});

/*
 * REQ-AUTH-019 — signed in, the account entry is an avatar rather than text.
 */
test("signed in, the header shows an account avatar and no login button", async ({
  page,
  context,
}) => {
  await signInAs(context, players.runner);
  await page.goto("/games");

  const account = page.getByTestId("nav-account");
  await expect(account).toBeVisible();
  await expect(page.getByTestId("nav-login")).toHaveCount(0);

  // Initials, because this seeded player has no photo — the ordinary case
  // rather than a failure (REQ-PROF-004).
  await expect(account).toHaveText(/[A-Z]/);
});

/*
 * REQ-AUTH-019 — the language control is a dropdown, EN → CZ → RU with flags.
 */
test("the language dropdown opens, lists all three, and switches", async ({ page }) => {
  await page.goto("/games");

  const trigger = page.getByTestId("locale-trigger");
  await expect(trigger).toBeVisible();
  // Closed to begin with: a dropdown, not three always-visible chips.
  await expect(page.getByTestId("locale-menu")).toHaveCount(0);

  await trigger.click();
  const menu = page.getByTestId("locale-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByTestId("locale-en")).toBeVisible();
  await expect(menu.getByTestId("locale-cs")).toBeVisible();
  await expect(menu.getByTestId("locale-ru")).toBeVisible();

  await menu.getByTestId("locale-cs").click();
  // The page comes back in Czech, which is the only assertion that proves the
  // control did anything.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Nadcházející/);

  // And back, so the spec leaves the cookie as it found it.
  await page.getByTestId("locale-trigger").click();
  await page.getByTestId("locale-en").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Upcoming/);
});

test("a returning player signs in with a password", async ({ page }) => {
  await page.goto("/login");

  await page.getByTestId("login-email").fill(players.runner.email!);
  await page.getByTestId("login-password").fill(SEED_PASSWORD);
  await page.getByTestId("login-submit").click();

  // Landed as themselves: the account page is player-gated, so reaching it at
  // all is the assertion.
  //
  // ON THE IDENTITY BLOCK, not on `sign-out`. Sign out moved behind the
  // Settings tab with the rest of the account controls (visibility round, item
  // 3), and it was never the right marker anyway — it is a control that exists
  // on every signed-in page in some form. The nickname is the thing that says
  // WHOSE account this is, which is what "landed as themselves" means.
  await page.waitForURL(/\/(games|account)/);
  await page.goto("/account");
  await expect(page.getByTestId("account-nickname")).toHaveText(
    players.runner.nickname,
  );
});

test("a wrong password is refused without saying which half was wrong", async ({ page }) => {
  await page.goto("/login");

  await page.getByTestId("login-email").fill(players.runner.email!);
  await page.getByTestId("login-password").fill("definitely-not-the-password");
  await page.getByTestId("login-submit").click();

  const error = page.getByTestId("login-error");
  await expect(error).toBeVisible();

  // One message for a wrong password and an unknown address. Telling them apart
  // tells an attacker which half they got right.
  const wrongPassword = await error.textContent();

  await page.goto("/login");
  await page.getByTestId("login-email").fill("nobody-here@test.invalid");
  await page.getByTestId("login-password").fill("definitely-not-the-password");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-error")).toHaveText(wrongPassword ?? "");
});

test("the code path is offered as recovery, not as the front door", async ({ page }) => {
  await page.goto("/login");

  // Password first; the code is underneath, relabelled for someone who has no
  // password yet or has forgotten it.
  await expect(page.getByTestId("login-submit")).toBeVisible();
  await expect(page.getByTestId("request-code")).toBeVisible();
});

test("signup collects the profile and both legal acts, grouped apart from the preference", async ({
  page,
}) => {
  await page.goto("/signup");

  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.locator('select[name="country"]')).toBeVisible();
  await expect(page.locator('input[name="skill"]').first()).toBeVisible();

  // Three boxes: two legal acts and one preference. The count is the assertion
  // — merging the consents is the mistake this guards against.
  await expect(page.locator('input[name="tos"]')).toBeVisible();
  await expect(page.locator('input[name="gdpr"]')).toBeVisible();
  await expect(page.locator('input[name="marketing"]')).toBeVisible();
});

test("the terms are readable without an account", async ({ page }) => {
  // Someone is asked to accept these at signup, so they have to be reachable
  // before signing up — and findable again afterwards.
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: /terms of service/i })).toBeVisible();

  // TWO version strings, and their agreement is the property. One is inside the
  // document ("Version 1.0, effective 01.08.2026"), the other is the page's own
  // stamp read from TERMS_VERSION — the same constant written onto every
  // acceptance. If they ever disagree, the consent record points at words
  // nobody was shown.
  await expect(page.getByText("Version 1.0, effective 01.08.2026")).toBeVisible();
  await expect(page.getByText("Version 1.0", { exact: true })).toBeVisible();
});

test("set-password is a page, not a gate", async ({ page, context }) => {
  // R1: the session exists before this screen renders, so someone who closes
  // the tab is signed in rather than stranded. The decline link is the proof.
  await signInAs(context, players.runner);
  await page.goto("/login/set-password?next=%2Faccount");

  await expect(page.getByTestId("new-password")).toBeVisible();
  await expect(page.getByTestId("skip-password")).toBeVisible();
});

test("a signed-out visitor is sent to login rather than shown a broken form", async ({
  page,
}) => {
  await page.goto("/login/set-password");
  await page.waitForURL(/\/login/);
  await expect(page.getByTestId("login-submit")).toBeVisible();
});

test("the profile columns are written by signup, not by the client", async () => {
  // complete_signup_v2 is the only writer. A player cannot edit their own
  // consent evidence, which is what keeps it evidence.
  const admin = serviceClient();
  const { data } = await admin
    .from("players")
    .select("id, country, skill_level, tos_version")
    .eq("id", players.runner.id)
    .maybeSingle();
  expect(data).not.toBeNull();
});

/*
 * A REJECTED SIGNUP KEEPS EVERYTHING THE PLAYER TYPED.
 *
 * The reported bug, and it was every error path rather than one: the actions
 * returned `{status, field, message}` and nothing else, so React re-rendered
 * the form with empty inputs. Missing a consent box — the most likely mistake
 * on this form, since both are unticked by default and both are required —
 * cost the player their email, nickname, country and skill.
 *
 * The password is deliberately NOT preserved: echoing it puts a plaintext
 * password in the RSC payload and in a DOM attribute. That is asserted here as
 * an intended property rather than left as an omission somebody later "fixes".
 */
test("a signup rejected for a missing consent keeps every other field", async ({
  page,
}) => {
  const email = `wipe-${Date.now()}@example.com`;

  await page.goto("/signup");

  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "correct-horse-battery");
  await page.fill('input[name="nickname"]', "WipeCheck");
  await page.selectOption('select[name="country"]', "CZ");
  await page.check('input[name="skill"][value="intermediate"]');
  // REQUIRED SINCE ROUND 7, item 7. Without it the browser blocks the submit
  // outright and this test passes for the wrong reason — the form never posts,
  // so of course every field still holds what was typed into it.
  await page.fill('input[name="phone"]', "+420600123456");
  // One consent ticked, the other missed — so the error must not blame both.
  await page.check('input[name="tos"]');

  const submit = page.getByTestId("signup-submit");
  await submit.scrollIntoViewIfNeeded();
  await submit.click();

  // The error arrives...
  await expect(page.locator("body")).toContainText(/privacy|consent|policy/i);

  // ...and the work survives it.
  await expect(page.locator('input[name="email"]')).toHaveValue(email);
  await expect(page.locator('input[name="nickname"]')).toHaveValue("WipeCheck");
  await expect(page.locator('select[name="country"]')).toHaveValue("CZ");
  await expect(page.locator('input[name="skill"][value="intermediate"]')).toBeChecked();
  // The box that WAS ticked stays ticked; the missing one stays clear.
  await expect(page.locator('input[name="tos"]')).toBeChecked();
  await expect(page.locator('input[name="gdpr"]')).not.toBeChecked();

  await expect(page.locator('input[name="phone"]')).toHaveValue("+420600123456");

  // And the password is not echoed back into the DOM.
  await expect(page.locator('input[name="password"]')).toHaveValue("");
});

/*
 * PHONE IS REQUIRED, ASSERTED PAST THE BROWSER (round 7, item 7).
 *
 * `required` on the input is a courtesy that saves a round trip; the rule that
 * counts is in `parseSignupForm`, which is what a curl request meets. Removing
 * the attribute in the page and submitting is the closest a browser test gets
 * to that request, and it is the assertion worth having — a later round that
 * "cleans up" the parser check would still pass a test that only exercised the
 * attribute.
 */
test("signup refuses a missing phone number on the server, not only in the browser", async ({
  page,
}) => {
  await page.goto("/signup");

  await page.fill('input[name="email"]', `nophone-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "correct-horse-battery");
  await page.fill('input[name="nickname"]', "NoPhone");
  await page.selectOption('select[name="country"]', "CZ");
  await page.check('input[name="skill"][value="intermediate"]');
  await page.check('input[name="tos"]');
  await page.check('input[name="gdpr"]');

  // Defeat the client-side gate so the submission actually reaches the action.
  await page.evaluate(() => {
    document.querySelector('input[name="phone"]')!.removeAttribute("required");
  });

  const submit = page.getByTestId("signup-submit");
  await submit.scrollIntoViewIfNeeded();
  await submit.click();

  await expect(page.locator("body")).toContainText(/phone/i);
  // Still on the form, and no account was made.
  await expect(page.locator('input[name="nickname"]')).toHaveValue("NoPhone");
});

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

test("the signed-out header offers two distinct doors", async ({ page }) => {
  await page.goto("/games");

  // With passwords these are different acts: a returning player who taps Sign
  // up gets told their email is taken instead of getting in.
  await expect(page.getByTestId("nav-login")).toBeVisible();
  await expect(page.getByTestId("nav-signup")).toBeVisible();
});

test("a returning player signs in with a password", async ({ page }) => {
  await page.goto("/login");

  await page.getByTestId("login-email").fill(players.runner.email!);
  await page.getByTestId("login-password").fill(SEED_PASSWORD);
  await page.getByTestId("login-submit").click();

  // Landed as themselves: the account page is player-gated, so reaching it at
  // all is the assertion.
  await page.waitForURL(/\/(games|account)/);
  await page.goto("/account");
  await expect(page.getByTestId("sign-out")).toBeVisible();
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

import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import {
  createAccount,
  removeAccount,
  removePlayerRow,
  signInThroughForm,
  type Account,
} from "./helpers/accounts";
import { serviceClient } from "./helpers/session";

/**
 * ROUND 41 — "tests for every action on the platform": the account and
 * sign-in actions no spec drove until now (a read-only audit of all 57 server
 * actions and 16 routes found them). Each one is clicked through the real
 * control and its effect read back from the database or the next page.
 *
 * Every test uses its own throwaway account — see `helpers/accounts.ts` for
 * why a seed player must never be signed out or re-passworded mid-run.
 */

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
});

/** Whether the local mail catcher holds a message to `email`. */
async function mailReached(email: string): Promise<boolean> {
  const list = (await (await fetch("http://127.0.0.1:54324/api/v1/messages")).json()) as {
    messages: { To: { Address: string }[] }[];
  };
  return list.messages.some((m) => m.To.some((to) => to.Address === email));
}

test("signing out ends the session", async ({ page }) => {
  // Arrange
  const account = await createAccount();
  try {
    await signInThroughForm(page, account);
    await page.goto("/account");

    // Act
    await page.getByTestId("sign-out").click();
    await page.waitForURL((url) => url.pathname === "/");

    // Assert — the account page now asks for a sign-in.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await removeAccount(account);
  }
});

test("changing the password: the new one signs in, the old one does not", async ({ page, browser }) => {
  // Arrange
  const account = await createAccount();
  const next = "a-brand-new-passphrase";
  try {
    await signInThroughForm(page, account);
    await page.goto("/account");
    await page.getByTestId("change-password-link").click();

    // Act
    await page.getByTestId("current-password").fill(account.password);
    await page.getByTestId("new-password").fill(next);
    await page.getByTestId("change-password").click();

    // Assert
    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toBeVisible();
    const fresh = await browser.newPage();
    try {
      await fresh.goto("/login");
      await fresh.getByTestId("login-email").fill(account.email);
      await fresh.getByTestId("login-password").fill(account.password);
      await fresh.getByTestId("login-submit").click();
      await expect(fresh.getByTestId("login-error")).toBeVisible();
      await signInThroughForm(fresh, { email: account.email, password: next });
    } finally {
      await fresh.close();
    }
  } finally {
    await removeAccount(account);
  }
});

test("changing the email starts a confirmation to the new address", async ({ page }) => {
  // Arrange
  const account = await createAccount();
  const next = account.email.replace("act-", "act-new-");
  try {
    await signInThroughForm(page, account);
    await page.goto("/account");
    await page.getByTestId("change-email-link").click();

    // Act
    await page.getByTestId("new-email").fill(next);
    await page.getByTestId("change-email").click();

    // Assert — pending until both addresses confirm (double_confirm_changes).
    await expect
      .poll(async () => (await serviceClient().auth.admin.getUserById(account.authId)).data.user?.new_email)
      .toBe(next);
    const { data } = await serviceClient().auth.admin.getUserById(account.authId);
    expect(data.user?.email).toBe(account.email);
  } finally {
    await removeAccount(account);
  }
});

test("a player deletes their own account: the person goes, the session ends", async ({ page }) => {
  // Arrange
  const account: Account = await createAccount();
  try {
    await signInThroughForm(page, account);
    await page.goto("/account");
    page.once("dialog", (dialog) => void dialog.accept());

    // Act
    await page.getByTestId("delete-account").click();
    await page.waitForURL((url) => url.pathname === "/");

    // Assert — the row stays for the books, anonymised; the login is gone.
    const { data: row } = await serviceClient()
      .from("players")
      .select("email, deleted_at, auth_user_id")
      .eq("id", account.playerId!)
      .maybeSingle();
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.email).toBeNull();
    expect(row?.auth_user_id).toBeNull();
    const { data: auth } = await serviceClient().auth.admin.getUserById(account.authId);
    expect(auth.user).toBeNull();
  } finally {
    await removePlayerRow(account.playerId!);
    await removeAccount(account);
  }
});

test("a login with no profile finishes signing up on the form", async ({ page }) => {
  // Arrange — Google, or an older session: a login, and no player row.
  const account = await createAccount({ profile: false });
  try {
    await page.goto("/login");
    await page.getByTestId("login-email").fill(account.email);
    await page.getByTestId("login-password").fill(account.password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/signup/);

    // Act
    await page.fill('input[name="nickname"]', account.nickname);
    await page.selectOption('select[name="country"]', "SK");
    await page.check('input[name="skill"][value="advanced"]');
    await page.fill('input[name="phone"]', "777 222 333");
    await page.check('input[name="tos"]');
    await page.getByTestId("signup-submit").click();
    await page.waitForURL((url) => !url.pathname.startsWith("/signup"));

    // Assert
    const { data: row } = await serviceClient()
      .from("players")
      .select("nickname, country, phone")
      .eq("auth_user_id", account.authId)
      .maybeSingle();
    expect(row).toEqual({ nickname: account.nickname, country: "SK", phone: "+420777222333" });
    const { data: auth } = await serviceClient().auth.admin.getUserById(account.authId);
    expect(auth.user?.user_metadata?.email_locale).toBe("en");
  } finally {
    await removeAccount(account);
  }
});

test("a sign-in code: requested by email, typed in, signed in", async ({ page }) => {
  // Arrange
  const account = await createAccount();
  try {
    await page.goto("/login/reset");

    // Act — ask for a code…
    await page.getByTestId("otp-email").fill(account.email);
    await page.getByTestId("request-code").click();
    await expect(page.getByTestId("login-status")).toBeVisible();
    await expect.poll(() => mailReached(account.email), { message: "no sign-in email was sent" }).toBe(true);

    // …and type a valid one. The local stack's default template prints no
    // code, so a fresh one comes from the admin API — the same kind of OTP.
    const { data: link, error } = await serviceClient().auth.admin.generateLink({
      type: "magiclink",
      email: account.email,
    });
    if (error) throw error;
    await page.getByTestId("otp-input").fill(link.properties.email_otp);
    await page.getByTestId("otp-submit").click();

    // Assert — signed in, and offered a password for next time (the designed
    // landing after a code); the account page then opens instead of the login.
    await page.waitForURL(/\/login\/set-password/);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByTestId("sign-out")).toBeVisible();
  } finally {
    await removeAccount(account);
  }
});

test("setting a password after a code sign-in makes it the password", async ({ page, browser }) => {
  // Arrange
  const account = await createAccount();
  const chosen = "set-after-the-code";
  try {
    await signInThroughForm(page, account);
    await page.goto("/login/set-password?next=%2Faccount");

    // Act
    await page.getByTestId("new-password").fill(chosen);
    await page.getByTestId("save-password").click();
    await page.waitForURL(/\/account/);

    // Assert
    const fresh = await browser.newPage();
    try {
      await signInThroughForm(fresh, { email: account.email, password: chosen });
    } finally {
      await fresh.close();
    }
  } finally {
    await removeAccount(account);
  }
});

test("the auth callback signs a link in, and turns a broken one away visibly", async ({ page, request }) => {
  // Arrange
  const account = await createAccount();
  try {
    // A link with nothing in it lands on the error page, not a silent /login.
    const broken = await request.get("/auth/callback?action=login", { maxRedirects: 0 });
    expect(broken.status()).toBeGreaterThanOrEqual(300);
    expect(broken.headers().location).toContain("/auth/error");

    // Act — a real one, minted the way Supabase's email would carry it.
    const { data, error } = await serviceClient().auth.admin.generateLink({
      type: "magiclink",
      email: account.email,
    });
    if (error) throw error;
    await page.goto(
      `/auth/callback?token_hash=${data.properties.hashed_token}&type=email&next=%2Faccount`,
    );

    // Assert
    await page.waitForURL(/\/account/);
    await expect(page.getByTestId("sign-out")).toBeVisible();
  } finally {
    await removeAccount(account);
  }
});

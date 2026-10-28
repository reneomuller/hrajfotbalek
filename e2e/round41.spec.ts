import { expect, test, type Page } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { execAsOwner } from "./helpers/clock";
import { createScratchGame, destroyScratchGame, gamePathOf } from "./helpers/scaffold";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";

/**
 * ROUND 41 — the owner's overnight list, driven through the browser.
 *
 *   · signup: a country-code picker beside the number, the email language
 *     pre-set from the page and changeable, the newsletter in Hraj Fotbal's
 *     name — and a new account's bell starts empty
 *   · one notification can be deleted, the rest stay
 *   · a game has a short link, and it is what Share sends
 *   · the account page sets the email language
 *   · the dashboard lists new sign-ups with the minute they were made
 *
 * Every row a test makes, it removes. Accounts made here are deleted whole —
 * the auth user and the player — so the seed tableau is what it was.
 */

test.use({ viewport: { width: 390, height: 844 } });

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function broadcast(title: string): Promise<string> {
  const organizer = await apiClientFor(players.organizer);
  const { data, error } = await organizer.rpc("admin_create_notification", {
    p_title: title,
    p_body: "Round 41 e2e",
  });
  if (error) throw new Error(`admin_create_notification: ${error.message}`);
  return data as string;
}

async function removeNotifications(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await execAsOwner("delete from public.user_notification_reads where notification_id = any($1::uuid[])", [ids]);
  await execAsOwner("delete from public.notifications where id = any($1::uuid[])", [ids]);
}

/** A whole account, gone: what it consented to, its bell, its row, its login. */
async function removeAccount(email: string): Promise<void> {
  await execAsOwner(
    `with p as (select id from public.players where email = $1)
     delete from public.consent_records where player_id in (select id from p)`,
    [email],
  );
  await execAsOwner(
    `delete from public.user_notification_reads
      where player_id in (select id from public.players where email = $1)`,
    [email],
  );
  await execAsOwner(
    "delete from public.events where player_id in (select id from public.players where email = $1)",
    [email],
  );
  await execAsOwner("delete from public.players where email = $1", [email]);
  await execAsOwner("delete from auth.users where email = $1", [email]);
}

async function openBell(page: Page): Promise<void> {
  await page.getByTestId("notification-bell").click();
  await expect(page.getByTestId("notification-panel")).toBeVisible();
}

test("signup: the phone takes a country code, emails take a language, and the bell starts empty", async ({
  page,
  context,
}) => {
  test.slow();

  // Arrange — an announcement sent BEFORE this account exists.
  const email = `r41-${stamp()}@example.com`;
  const nickname = `R41${stamp().slice(-6)}`;
  const before = await broadcast(`Before you joined ${stamp()}`);
  const made: string[] = [before];
  await context.addCookies([{ name: LOCALE_COOKIE, value: "cs", domain: "localhost", path: "/" }]);

  try {
    await page.goto("/signup");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', "correct-horse-battery");
    await page.fill('input[name="nickname"]', nickname);
    await page.selectOption('select[name="country"]', "CZ");
    await page.check('input[name="skill"][value="intermediate"]');

    // The prefix: Czech by default, then British — flag and code follow.
    await expect(page.getByTestId("phone-country")).toHaveAttribute("data-country", "CZ");
    await expect(page.getByTestId("phone-dial")).toHaveText("+420");
    await page.getByTestId("phone-country-select").selectOption("GB");
    await expect(page.getByTestId("phone-country")).toHaveAttribute("data-country", "GB");
    await expect(page.getByTestId("phone-dial")).toHaveText("+44");
    await page.fill('input[name="phone"]', "07400 123456");

    // The email language is pre-set to the page's (Czech here); choose Ukrainian.
    await expect(page.getByTestId("signup-email-locale")).toHaveValue("cs");
    await page.getByTestId("signup-email-locale").selectOption("uk");

    // The newsletter is Hraj Fotbal's, not the operator's.
    await expect(page.locator('input[name="marketing"]').locator("..")).toContainText("Hraj Fotbal");
    await expect(page.locator('input[name="marketing"]').locator("..")).not.toContainText("Playllu");

    await page.check('input[name="tos"]');

    // Act
    const submit = page.getByTestId("signup-submit");
    await submit.scrollIntoViewIfNeeded();
    await submit.click();
    await page.waitForURL(/\/games/);

    // Assert — one international number, stored.
    const admin = serviceClient();
    const { data: player } = await admin
      .from("players")
      .select("phone, auth_user_id")
      .eq("email", email)
      .maybeSingle();
    expect(player?.phone).toBe("+447400123456");

    // The language chosen for emails lives on the account.
    const { data: auth } = await admin.auth.admin.getUserById(player!.auth_user_id as string);
    expect(auth.user?.user_metadata?.email_locale).toBe("uk");

    // A clean bell, although an announcement went out before they joined.
    await page.goto("/games");
    await openBell(page);
    await expect(page.getByTestId("notification-empty")).toBeVisible();

    // And what is sent after they joined does reach them.
    const after = await broadcast(`After you joined ${stamp()}`);
    made.push(after);
    await page.goto("/games");
    await openBell(page);
    await expect(page.locator(`[data-notification-id="${after}"]`)).toBeVisible();
    await expect(page.locator(`[data-notification-id="${before}"]`)).toHaveCount(0);
  } finally {
    await removeNotifications(made);
    await removeAccount(email);
  }
});

test("a player deletes one notification and keeps the rest", async ({ page, context }) => {
  // Arrange
  const first = await broadcast(`Delete me ${stamp()}`);
  const second = await broadcast(`Keep me ${stamp()}`);
  await signInAs(context, players.runner);
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);

  try {
    await page.goto("/games");
    await openBell(page);
    const doomed = page.locator(`[data-notification-id="${first}"]`);
    await expect(doomed).toBeVisible();

    // Act
    await doomed.getByTestId("notification-delete").click();

    // Assert — gone from the bell, the other one still there.
    await expect(page.locator(`[data-notification-id="${first}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-notification-id="${second}"]`)).toBeVisible();

    // And it is THIS reader's dismissal, not a deletion of the notification.
    const admin = serviceClient();
    const { data: still } = await admin.from("notifications").select("id").eq("id", first);
    expect(still).toHaveLength(1);
  } finally {
    await removeNotifications([first, second]);
  }
});

test("a game has a short link, and it is what Share sends", async ({ page, context }) => {
  // Arrange
  const game = await createScratchGame({ capacity: 10 });
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);

  try {
    const path = await gamePathOf(game.id);
    expect(path, "the game has no number — is migration 20261028100000 applied locally?").toMatch(
      /^\/game\/\d+$/,
    );

    // Act
    await page.goto(path);

    // Assert — the page is the game's, at the short address.
    await expect(page.getByTestId("hero-photo")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${path}$`));

    // The WhatsApp message carries the short link, last, after the places line.
    const href = await page.getByTestId("share-whatsapp").getAttribute("href");
    const text = decodeURIComponent(href!.replace("https://wa.me/?text=", ""));
    expect(text.startsWith("⚽")).toBe(true);
    expect(text).toMatch(/spots? left – grab one 👉 /);
    expect(text.endsWith(path)).toBe(true);

    // The old address still works — every link already shared stays good.
    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("hero-photo")).toBeVisible();

    // And nonsense is the not-found page, not a database error. (The status
    // itself is set by `generateMetadata` and is a production-build property —
    // `next dev` streams a 200 — so this asserts what the reader sees.)
    await page.goto("/game/not-a-game");
    await expect(page.getByText("Nothing here")).toBeVisible();
    await page.goto("/game/999999999");
    await expect(page.getByText("Nothing here")).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("the account page sets the language emails arrive in", async ({ page, context }) => {
  // Arrange
  const admin = serviceClient();
  const { data: runner } = await admin
    .from("players")
    .select("auth_user_id")
    .eq("id", players.runner.id)
    .maybeSingle();
  const authId = runner!.auth_user_id as string;
  const { data: before } = await admin.auth.admin.getUserById(authId);
  const original = { ...(before.user?.user_metadata ?? {}) };
  await signInAs(context, players.runner);
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);

  try {
    await page.goto("/account");
    const select = page.getByTestId("email-locale-select");
    await select.scrollIntoViewIfNeeded();

    // Act
    await select.selectOption("cs");

    // Assert
    await expect(page.getByTestId("email-locale-saved")).toBeVisible();
    await expect
      .poll(async () => (await admin.auth.admin.getUserById(authId)).data.user?.user_metadata?.email_locale)
      .toBe("cs");
  } finally {
    await admin.auth.admin.updateUserById(authId, { user_metadata: { ...original, email_locale: original.email_locale ?? null } });
  }
});

test("the dashboard lists new sign-ups with the minute each was made", async ({ page, context }) => {
  // Arrange
  await signInAs(context, players.organizer);

  // Act
  await page.goto("/admin");

  // Assert
  const list = page.getByTestId("dashboard-signups");
  await expect(list).toBeVisible();
  await expect(list.getByTestId("dashboard-signup").first()).toBeVisible();
  await expect(list.getByTestId("dashboard-signup-at").first()).toHaveText(
    /^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/,
  );

  // The count is of accounts: a shadow player cannot sign in, so is not one.
  const admin = serviceClient();
  const { count } = await admin
    .from("players")
    .select("id", { count: "exact", head: true })
    .not("auth_user_id", "is", null)
    .is("deleted_at", null);
  await expect(page.getByTestId("tile-players")).toContainText(String(count));
});

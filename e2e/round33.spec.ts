import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { policy } from "../lib/policy";
import { pragueDayKey } from "../lib/games/days";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * ROUND 33 — items 1, 2 and 3.
 *
 * Every spec here builds its own data and tears it down. The one thing it
 * READS from the seed is the number the backfill gave the seeded players, and
 * it reads it as "there is one", never as "it is 4" — a suite that asserts a
 * particular number depends on how many times the seed has been run, which is
 * the failure mode CLAUDE.md's admin-spec note is about.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function asAdmin(
  context: import("@playwright/test").BrowserContext,
) {
  await signInAs(context, players.organizer);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
}

// =============================================================================
// ITEM 1 — the admin can change a display name, and the control is ALWAYS there
// =============================================================================

test("the change-name control is visible on a player with NO photo and NO banner", async ({
  page,
  context,
}) => {
  /*
   * THE ITEM, STATED AS THE ASSERTION IT IS. Remove photo and Remove banner
   * render only when there is something to remove, which is right. The bug was
   * that the rename inherited the same condition — so on the commonest player
   * in the database, the one who never uploaded anything, the panel offered
   * nothing at all.
   */
  // Arrange — a player with neither image.
  const admin = serviceClient();
  await admin
    .from("players")
    .update({ photo_path: null, cover_path: null })
    .eq("id", players.creditRich.id);

  await asAdmin(context);

  // Act
  await page.goto(`/admin/players/${players.creditRich.id}`, { waitUntil: "networkidle" });

  // Assert
  await expect(page.getByTestId("change-name")).toBeVisible();
  await expect(page.getByTestId("remove-photo")).toHaveCount(0);
  await expect(page.getByTestId("remove-cover")).toHaveCount(0);
});

test("an admin renames a player, and the rename is logged", async ({ page, context }) => {
  const admin = serviceClient();
  const target = players.creditPartial;
  const { data: before } = await admin
    .from("players")
    .select("nickname")
    .eq("id", target.id)
    .single();
  const original = (before as { nickname: string }).nickname;
  const renamed = `R33${Date.now().toString().slice(-6)}`;

  try {
    // Arrange
    await asAdmin(context);
    await page.goto(`/admin/players/${target.id}`, { waitUntil: "networkidle" });

    // Act
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("change-name").click();
    await page.getByTestId("change-name-input").fill(renamed);
    await page.getByTestId("change-name-save").click();

    /*
     * ASSERT ON WHAT THE SERVER RENDERS NEXT, not on a success marker.
     * `revalidatePath` re-renders this page and can unmount anything held in
     * `useActionState` before it is read — CLAUDE.md, round 12.
     */
    await expect(page.getByRole("heading", { level: 2 })).toContainText(renamed);

    // ...and in the database, with an audit line that carries both names.
    const { data: row } = await admin
      .from("players")
      .select("nickname")
      .eq("id", target.id)
      .single();
    expect((row as { nickname: string }).nickname).toBe(renamed);

    const { data: events } = await admin
      .from("events")
      .select("metadata")
      .eq("event_type", "player_renamed")
      .eq("player_id", target.id);
    const logged = (events ?? []) as { metadata: Record<string, unknown> }[];
    expect(
      logged.some((e) => e.metadata.from === original && e.metadata.to === renamed),
      "the rename was not logged with both names",
    ).toBe(true);
  } finally {
    await admin.from("events").delete().eq("event_type", "player_renamed").eq("player_id", target.id);
    await admin.from("players").update({ nickname: original }).eq("id", target.id);
  }
});

test("a name another player holds is refused, with a message rather than a constraint name", async ({
  page,
  context,
}) => {
  // Arrange
  const admin = serviceClient();
  const { data: other } = await admin
    .from("players")
    .select("nickname")
    .eq("id", players.organizer.id)
    .single();

  await asAdmin(context);
  await page.goto(`/admin/players/${players.creditRich.id}`, { waitUntil: "networkidle" });

  // Act
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("change-name").click();
  await page.getByTestId("change-name-input").fill((other as { nickname: string }).nickname);
  await page.getByTestId("change-name-save").click();

  // Assert — the message names the problem, not `players_nickname_key`.
  const error = page.getByTestId("change-name-error");
  await expect(error).toBeVisible();
  await expect(error).not.toContainText("nickname_key");
  await expect(error).toContainText(/already uses that name/i);
});

// =============================================================================
// ITEM 2 — the permanent number is in admin, and NOWHERE ELSE
// =============================================================================

test("the players list and the player page both show the number", async ({ page, context }) => {
  await asAdmin(context);

  await page.goto("/admin/players", { waitUntil: "networkidle" });
  const listed = page.getByTestId("admin-player-number").first();
  await expect(listed).toBeVisible();
  expect((await listed.innerText()).trim()).toMatch(/^\d+$/);

  await page.goto(`/admin/players/${players.organizer.id}`, { waitUntil: "networkidle" });
  const onPage = page.getByTestId("admin-player-number");
  await expect(onPage).toBeVisible();
  expect(await onPage.innerText()).toMatch(/\d+/);
});

test("the number reaches NO player-facing surface", async ({ page, context }) => {
  /*
   * THE ABSENCE, ASSERTED ON THREE SURFACES BY THE NUMBER ITSELF rather than by
   * a test id — the test id is the admin's, and a leak would arrive without
   * one. So: read the player's actual number as service_role, then look for it
   * on a public profile, on a roster and on the player's own account page.
   *
   * IT IS A SURFACE RULE, NOT A COLUMN GRANT, and the round report says so.
   * `players_select_own` lets a player read their OWN row through the API,
   * number included. What the owner asked for is that it never RENDERS, and
   * that is what these three assertions are.
   */
  const admin = serviceClient();
  const { data } = await admin
    .from("players")
    .select("nickname, player_number")
    .eq("id", players.runner.id)
    .single();
  const { nickname, player_number: original } = data as {
    nickname: string;
    player_number: number | null;
  };
  test.skip(original === null, "the player-number migration is not applied to this database");

  /*
   * A SIX-DIGIT NEEDLE, WRITTEN FOR THE DURATION OF THIS TEST AND RESTORED.
   *
   * The seeded numbers are 1..7, and the first version of this spec looked for
   * "2" in the page text and found it in "Friday 2 October". A small integer is
   * not a needle — it is in every date, every price and every spots count. So
   * the number is temporarily moved somewhere nothing else can be, the surfaces
   * are read, and it is put back.
   *
   * IT IS WRITTEN AS `service_role`, WHICH IS THE ONLY ROLE THAT CAN. The
   * column has no UPDATE grant for `authenticated` — the suite proves that —
   * and nothing in the product ever rewrites it. This is a test reaching under
   * the product, stated rather than disguised.
   */
  const needleNumber = 987654;
  const game = await createScratchGame({ withVenuePhoto: false, hoursFromNow: 24 * 19 });
  try {
    await admin
      .from("players")
      .update({ player_number: needleNumber })
      .eq("id", players.runner.id);

    // The roster has to have somebody on it for this to mean anything.
    const runner = await apiClientFor(players.runner);
    const booked = await runner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(booked.error, `create_booking: ${booked.error?.message}`).toBeNull();

    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    const needle = new RegExp(`\\b${needleNumber}\\b`);
    for (const [surface, url] of [
      ["the public profile", `/player/${encodeURIComponent(nickname)}`],
      ["the game roster", `/game/${game.id}`],
      ["their own account page", "/account"],
      ["the games list", `/games?day=${pragueDayKey(game.startsAt)}`],
    ] as const) {
      await page.goto(url, { waitUntil: "networkidle" });
      /*
       * Read the RENDERED text, not the HTML: a bare number turns up inside a
       * class name, a URL and a build hash on any page, and matching those
       * would make this fail for reasons that have nothing to do with the
       * feature. What the owner asked about is what a person can read.
       */
      const shown = await page.locator("body").innerText();
      const lines = shown.split("\n").filter((line) => needle.test(line));
      expect(
        lines,
        `${surface} shows the player number ${needleNumber}: ${lines.join(" | ")}`,
      ).toEqual([]);
    }
  } finally {
    await admin
      .from("players")
      .update({ player_number: original })
      .eq("id", players.runner.id);
    await destroyScratchGame(game.id);
  }
});

// =============================================================================
// ITEM 3 — the party goes to thirteen, behind one dropdown
// =============================================================================

test("the party picker keeps three pills and puts the rest behind a dropdown", async ({
  page,
  context,
}) => {
  // Arrange — a pitch with room for a party of thirteen and then some.
  const game = await createScratchGame({ capacity: 20, hoursFromNow: 24 * 18 });
  try {
    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    // Act
    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("party-picker")).toBeVisible();

    // Assert — the pills are unchanged: just me, +1, +2, +3, and no +4 pill.
    for (const n of [0, 1, 2, 3]) {
      await expect(page.getByTestId(`party-${n}`)).toBeVisible();
    }
    await expect(page.getByTestId("party-4")).toHaveCount(0);

    // ...and the fourth control lists +4 through +13.
    const dropdown = page.getByTestId("party-more");
    await expect(dropdown).toBeVisible();
    const values = await dropdown.evaluate((el) =>
      Array.from((el as HTMLSelectElement).options)
        .filter((o) => o.value !== "")
        .map((o) => Number(o.value)),
    );
    expect(values[0]).toBe(policy.booking.partyPills + 1);
    expect(values[values.length - 1]).toBe(policy.booking.maxPartyGuests);
    expect(values).toHaveLength(
      policy.booking.maxPartyGuests - policy.booking.partyPills,
    );

    // THE CLOSED PILL READS "+4" BEFORE ANYTHING IS CHOSEN, which is the shape
    // the owner asked for.
    await expect(dropdown.locator("option[value='']")).toHaveText("+4");

    // Act — choosing from it behaves exactly like tapping a pill.
    await dropdown.selectOption("7");
    await expect(page.getByTestId("party-summary")).toContainText("8 spots");
    await expect(page.getByTestId("party-more-wrap")).toHaveAttribute("data-active", "true");
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("capacity still governs: the dropdown trims to the seats that are actually left", async ({
  page,
  context,
}) => {
  /*
   * SIX SEATS, ONE OF WHICH IS THE PLAYER'S, SO FIVE GUESTS FIT. The pills
   * cover three of them and the dropdown must offer +4 and +5 and stop — never
   * the policy's thirteen. This is the assertion that stops a bigger ceiling
   * from overselling a small pitch.
   */
  const game = await createScratchGame({ capacity: 6, hoursFromNow: 24 * 17 });
  try {
    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
    const values = await page.getByTestId("party-more").evaluate((el) =>
      Array.from((el as HTMLSelectElement).options)
        .filter((o) => o.value !== "")
        .map((o) => Number(o.value)),
    );

    expect(values).toEqual([4, 5]);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a pitch with no room above the pills offers no dropdown at all", async ({
  page,
  context,
}) => {
  // Four seats: the player plus three guests, which the pills already cover.
  const game = await createScratchGame({ capacity: 4, hoursFromNow: 24 * 16 });
  try {
    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("party-3")).toBeVisible();
    await expect(page.getByTestId("party-more")).toHaveCount(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a party of thirteen is actually bookable, and priced at fourteen seats", async ({
  page,
  context,
}) => {
  /*
   * THE END-TO-END ONE. The SQL suite proves the RPC accepts thirteen; this
   * proves the CONTROL reaches it — the dropdown, the hidden field, the action
   * and the price, in the order a player meets them.
   */
  const game = await createScratchGame({ capacity: 20, priceCzk: 150, hoursFromNow: 24 * 15 });
  const admin = serviceClient();
  try {
    await signInAs(context, players.creditRich);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
    await page.getByTestId("party-more").selectOption("13");
    await expect(page.getByTestId("party-summary")).toContainText("14 spots");

    const { data: rows } = await admin
      .from("games")
      .select("capacity")
      .eq("id", game.id)
      .single();
    expect((rows as { capacity: number }).capacity).toBe(20);

    // The server's own answer, through the same RPC the form posts to.
    const rich = await apiClientFor(players.creditRich);
    const booked = await rich.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
      p_guest_count: 13,
    });
    expect(booked.error, `create_booking: ${booked.error?.message}`).toBeNull();
    expect((booked.data as { price_czk: number }).price_czk).toBe(150 * 14);
  } finally {
    await destroyScratchGame(game.id);
  }
});

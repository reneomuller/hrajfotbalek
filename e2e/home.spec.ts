import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session.ts";

/**
 * G2 home-page specs (§6).
 *
 * `site_settings` is a SINGLETON, which makes it the one thing in this suite
 * that cannot be built and torn down per spec — there is one row and every
 * spec touching it shares it. So each spec here reads the value first and puts
 * it back afterwards, rather than assuming a starting state. A suite whose
 * result depends on the order it ran in is the flake that cannot be
 * reproduced.
 */

async function readSetting(key: string): Promise<unknown> {
  const admin = serviceClient();
  const { data } = await admin
    .from("site_settings")
    .select("settings")
    .eq("id", "singleton")
    .maybeSingle();
  return (data?.settings as Record<string, unknown> | undefined)?.[key] ?? null;
}

async function writeSetting(key: string, value: unknown): Promise<void> {
  const admin = serviceClient();
  const { error } = await admin.rpc("set_site_setting", { p_key: key, p_value: value });
  if (error) throw new Error(`set_site_setting(${key}): ${error.message}`);
}

/*
 * TEST-224 — the home page reads its settings ANONYMOUSLY.
 *
 * The assertion that matters is the signed-out one. Supabase grants nothing by
 * default here, so a missing grant would return empty rather than erroring —
 * and an empty stats strip looks like a content problem, not a permissions
 * one. This is the most repeated lesson in the project, and this is the table
 * where it would be least visible.
 */
test("a signed-out visitor sees both numbers and the four panels", async ({ page }) => {
  const previousPlayers = await readSetting("active_players");
  const previousGames = await readSetting("games_per_week");

  try {
    await writeSetting("active_players", 250);
    await writeSetting("games_per_week", 9);

    // No session at all — a fresh context, straight to the landing page.
    await page.goto("/");

    /*
     * ONE PLACE PER NUMBER, AND ONE ONLY. The old stats strip carried the
     * active-player count as well as the community heading, and the same
     * figure in two places invites the reader to check whether they agree —
     * a job the page should not hand out. v1.2 §6 gives the numbers their own
     * panel and takes the count back out of the heading.
     */
    await expect(page.getByTestId("stats-strip")).toHaveCount(0);
    await expect(page.getByTestId("community-heading")).not.toContainText("250");
    await expect(page.getByTestId("stat-players-value")).toContainText("250");
    await expect(page.getByTestId("stat-games-value")).toContainText("9");

    // Both render with the "+", because both are floors rather than counts.
    await expect(page.getByTestId("stat-games-value")).toContainText("+");

    // REQ-HOME-005 as amended — four panels.
    await expect(page.getByTestId("community-panel")).toBeVisible();
    await expect(page.getByTestId("stats-panel")).toBeVisible();
    await expect(page.getByTestId("faq-panel")).toBeVisible();
    await expect(page.getByTestId("potm-panel")).toBeVisible();

    // Real brand marks, not coloured dots — an SVG inside each link.
    await expect(page.getByTestId("community-whatsapp").locator("svg")).toBeVisible();
    await expect(page.getByTestId("community-instagram").locator("svg")).toBeVisible();

    // REQ-HOME-001 — how-it-works, with the equipment line beneath it.
    await expect(page.getByTestId("how-it-works")).toBeVisible();
    await expect(page.getByTestId("equipment-line")).toContainText("bibs");
  } finally {
    await writeSetting("active_players", previousPlayers ?? 0);
    await writeSetting("games_per_week", previousGames ?? 7);
  }
});

/*
 * v1.2 §6 — the home page shows the next THREE games, in the list's own row.
 *
 * The single "NEXT MATCH" card could only answer "is there a game". The
 * question a visitor arrives with is "is there a game I can make", which one
 * card answers "no" to as often as not.
 */
test("the home page shows the next three games as list rows", async ({ page }) => {
  await page.goto("/");

  const rows = page.getByTestId("next-matches").getByTestId("game-row");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(3);

  /*
   * THE SAME COMPONENT AS THE LIST, which is what keeps the two surfaces from
   * drifting — and the assertion has to track what that component carries.
   * It now carries the PRICE (reversing v1.2 §5.5), because `150 CZK / 1
   * credit` is how a reader learns what a credit is worth. Asserting its
   * absence here would be asserting that home and the list had diverged.
   */
  await expect(rows.first().getByTestId("spots-left")).toHaveAttribute("data-tone", /.+/);
  await expect(rows.first().getByTestId("card-price")).toBeVisible();

  // A section showing three of something says that three is not all of it.
  await page.getByTestId("next-matches-all").click();
  await page.waitForURL("**/games");
});

/*
 * REQ-HOME-007 — the six FAQ entries, as specified.
 */
test("the FAQ carries all six entries and they open", async ({ page }) => {
  await page.goto("/");

  const entries = page.getByTestId("faq-panel").locator("details");
  await expect(entries).toHaveCount(6);

  // Closed to begin with, and openable without JavaScript state.
  const first = entries.first();
  await expect(first.locator("p")).toBeHidden();
  await first.locator("summary").click();
  await expect(first.locator("p")).toBeVisible();
});

/*
 * Games-per-week is an ADMIN CLAIM now, not a computed count (migration 37).
 *
 * The distinction is the whole point and is asserted directly: the page shows
 * what the setting says even when it disagrees with how many games are actually
 * on the board. A trailing-seven-day count would have advertised a quiet
 * fortnight in August as the normal rate.
 */
test("games-per-week is what the admin set, not what the board holds", async ({ page }) => {
  const previous = await readSetting("games_per_week");

  try {
    await writeSetting("games_per_week", 42);
    await page.goto("/");
    await expect(page.getByTestId("stat-games-value")).toContainText("42");

    // The old strip is still gone. A removal nobody checks is a removal that
    // comes back.
    await expect(page.getByTestId("stats-strip")).toHaveCount(0);
  } finally {
    await writeSetting("games_per_week", previous ?? 7);
  }
});

/*
 * TEST-225 — an admin changes the number, the home page reflects it, and an
 * event records who did it.
 */
test("an admin changes the active-player number and the change is recorded", async ({
  page,
  context,
}) => {
  const previous = await readSetting("active_players");
  const admin = serviceClient();

  const { count: eventsBefore } = await admin
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "site_setting_changed");

  try {
    await signInAs(context, players.organizer);
    await page.goto("/admin/site");

    await page.getByTestId("active-players-input").fill("312");
    await page.getByTestId("active-players-submit").click();

    /*
     * WAIT ON THE DATABASE, NOT ON THE SUCCESS MARKER.
     *
     * `active-players-saved` is rendered from a `useActionState` result, and
     * the action calls `revalidatePath("/admin/site")` — so the re-render can
     * unmount the marker before Playwright ever observes it. This spec passed
     * in isolation and failed inside the full suite for exactly that reason,
     * which is the flake CLAUDE.md names: client-state success markers do not
     * survive `revalidatePath`, so assert on what the server renders next or on
     * the row itself.
     *
     * It also stops the navigation below from racing the action: `click()`
     * returns as soon as the form is submitted, and navigating immediately
     * afterwards aborts an in-flight server action.
     */
    await expect.poll(() => readSetting("active_players"), { timeout: 10_000 }).toBe(312);

    // The home page reflects it — in the one place it now appears.
    await page.goto("/");
    await expect(page.getByTestId("stat-players-value")).toContainText("312");

    // And the event records the change. A public claim about the size of the
    // community with no audit trail is a number nobody can account for.
    const { count: eventsAfter, data } = await admin
      .from("events")
      .select("player_id, metadata", { count: "exact" })
      .eq("event_type", "site_setting_changed")
      .order("created_at", { ascending: false })
      .limit(1);

    expect(eventsAfter).toBeGreaterThan(eventsBefore ?? 0);
    expect(data?.[0]?.player_id).toBe(players.organizer.id);
    expect((data?.[0]?.metadata as { value?: unknown })?.value).toBe(312);
  } finally {
    await writeSetting("active_players", previous ?? 0);
  }
});

/*
 * REQ-HOME-006 — Player of the Month falls back to initials.
 *
 * The fallback is not a degraded state: the pick recognises how someone plays,
 * not whether they uploaded a picture.
 */
test("player of the month renders, with initials when there is no photo", async ({
  page,
}) => {
  const previous = await readSetting("player_of_month");

  try {
    await writeSetting("player_of_month", players.runner.id);

    await page.goto("/");
    await expect(page.getByTestId("potm-nickname")).toHaveText(players.runner.nickname);
    // No photo on this seeded player, so initials — and no broken image.
    await expect(page.getByTestId("potm-photo")).toHaveCount(0);
    await expect(page.getByTestId("potm-avatar")).toContainText(/[A-Z]/);

    // Cleared, the panel invites rather than showing an empty frame.
    await writeSetting("player_of_month", null);
    await page.goto("/");
    await expect(page.getByTestId("potm-nickname")).toHaveCount(0);
    await expect(page.getByTestId("potm-panel")).toContainText("Nobody picked yet");
  } finally {
    await writeSetting("player_of_month", previous ?? null);
  }
});

/*
 * THE HERO LINE BREAKS AT ITS SENTENCE BOUNDARY, at both widths and in all
 * three languages — no orphan, and no line that stops mid-clause.
 *
 * Asserted structurally (one element per sentence) rather than by measuring
 * rendered line boxes: the measurement is what found the problem, but it is
 * font-dependent, and item 11 is about to change the font. What must stay true
 * is that a sentence cannot be split across lines, and that is a property of
 * the markup.
 */
test("the hero line renders one sentence per line", async ({ page }) => {
  for (const locale of ["en", "cs", "ru"] as const) {
    await page.context().addCookies([
      { name: "hf_locale", value: locale, domain: "localhost", path: "/" },
    ]);
    await page.goto("/");

    const lines = page.getByTestId("hero-vision").locator("span");
    await expect(lines, locale).toHaveCount(2);

    // Each is a whole sentence: it ends with a full stop and contains no
    // internal one.
    for (const line of await lines.all()) {
      const text = (await line.textContent())!.trim();
      expect(text.endsWith("."), `${locale}: "${text}"`).toBe(true);
      expect(text.slice(0, -1).includes("."), `${locale}: "${text}"`).toBe(false);
    }
  }
});

/*
 * STAGE 5 — ruling J's home order, as amended 2026-08-10.
 *
 * The amendment keeps Player of the Month (with its hours-on-pitch stat) and
 * the equipment line; everything else in the ruling is built as written. Both
 * survivors are asserted here BY NAME, because the thing most likely to go
 * wrong is a later session reading the original ruling and deleting them again.
 */
test.describe("the home page under ruling J", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("orders its sections as the amended ruling specifies", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    const order = await page.evaluate(() =>
      [...document.querySelectorAll("[data-testid]")]
        .map((n) => (n as HTMLElement).dataset.testid!)
        .filter((t) =>
          [
            "how-it-works",
            "next-matches",
            "next-matches-all",
            "stats-panel",
            "community-panel",
            "faq-panel",
            "potm-panel",
          ].includes(t),
        ),
    );

    expect(order).toEqual([
      "how-it-works",
      "next-matches",
      "next-matches-all",
      "stats-panel",
      "community-panel",
      "faq-panel",
      "potm-panel",
    ]);

    // The two survivors of the amendment.
    await expect(page.getByTestId("potm-panel")).toBeVisible();
    await expect(page.getByTestId("equipment-line")).toBeVisible();
  });

  test("clears the three steps above the fold", async ({ page }) => {
    /*
     * THE POINT OF THE HERO SHORTENING, and the reason it is asserted as a
     * fold clearance rather than as a percentage: ruling J asks for ">=25%"
     * in order that the steps be visible without scrolling. The percentage is
     * the means. Measured against the previous hero it is 26.7% on this
     * viewport and 32.1% on desktop, but that ratio is font- and
     * copy-dependent, and what must stay true is this.
     */
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    const steps = (await page.getByTestId("how-it-works").boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(steps.y + steps.height).toBeLessThanOrEqual(viewport.height);

    // And the hero no longer forces a full screen of its own.
    const heroFillsScreen = await page.evaluate(
      () =>
        (document.querySelector("section") as HTMLElement).getBoundingClientRect()
          .height >= window.innerHeight,
    );
    expect(heroFillsScreen).toBe(false);
  });
});

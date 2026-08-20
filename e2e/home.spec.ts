import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session.ts";
import { LOCALE_COOKIE } from "../lib/i18n/locales";

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
    // The standalone stats box is gone (Section 2, item 8) — its two numbers
    // live in the community panel now.
    await expect(page.getByTestId("stats-panel")).toHaveCount(0);
    await expect(page.getByTestId("community-stats")).toBeVisible();
    await expect(page.getByTestId("faq-panel")).toBeVisible();
    await expect(page.getByTestId("potm-panel")).toBeVisible();

    /*
       THE OFFICIAL MARKS, and asserted as LOADED rather than as present.
       They were inline SVGs; they are now the supplied artwork from
       `public/brand/` at 44px, side by side. A missing file renders as an
       empty box of exactly the right size, which is invisible in a dark panel
       and photographs as design — so `naturalWidth` is the assertion, not
       `toBeVisible`.
    */
    for (const id of ["community-whatsapp", "community-instagram"]) {
      const mark = page.getByTestId(id).locator("img");
      await expect(mark).toBeVisible();
      expect(
        await mark.evaluate((el) => (el as HTMLImageElement).naturalWidth),
        `${id} mark did not load`,
      ).toBeGreaterThan(0);
    }

    // REQ-HOME-001 — how-it-works, with the equipment line beneath it.
    await expect(page.getByTestId("how-it-works")).toBeVisible();
    // The equipment line is gone (Section 2, item 5) — a documented reversal
    // of ruling J's amendment, by the owner's order.
    await expect(page.getByTestId("equipment-line")).toHaveCount(0);
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
   * drifting — and the assertion tracks what that component carries.
   *
   * NO PRICE (layout law, 2026-08-10): the price and its credit equivalence
   * live on the game detail's claim bar now, where a reader is deciding about
   * one game rather than scanning eight. Both list surfaces are identical, so
   * this asserts the absence here as well as on `/games`.
   */
  await expect(rows.first().getByTestId("spots-left")).toHaveAttribute("data-tone", /.+/);
  await expect(rows.first().getByTestId("card-price")).toHaveCount(0);
  // The dotted line carries the spots figure and the faces; the raw count
  // caption is gone (layout law, final form).
  await expect(rows.first().getByTestId("row-spots")).toBeVisible();
  await expect(rows.first().getByTestId("card-players-count")).toHaveCount(0);

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
 * THE HERO HEADLINE BREAKS ONLY AT SENTENCE BOUNDARIES (redesign v2, round 3,
 * p01).
 *
 * WHAT THIS REPLACES, and why the subject changed rather than the assertion
 * being deleted: the previous spec was "the wordmark renders on one row" —
 * Section 2 item 1, about a hero that set "HRAJ FOTBAL." at display scale with
 * a hard `<br>` in it. Round 3 takes the wordmark out of the hero entirely
 * (the header already carries it), so there is no wordmark here to be one row.
 * The requirement it protected survives and is what is asserted here: the
 * headline never wraps in a place nobody chose.
 *
 * IT IS NOT A ROW COUNT, AND THAT IS THE FINDING. English and Czech set two
 * rows, which is the frame. RUSSIAN SETS THREE, and cannot do otherwise:
 * **Anton ships no Cyrillic subset** (`app/layout.tsx` loads `latin` and
 * `latin-ext`, which is all Google publishes for it), so every display heading
 * in Russian falls back to the body face. "КОГДА УГОДНО. ГДЕ УГОДНО." measures
 * 536px in that fallback against 358px of available width at 390 — fitting it
 * on one row needs a 29px hero, and the frame's is 44. This is a
 * product-wide property of the type system, not something this round
 * introduced; the hero is simply where it first has consequences.
 *
 * SO THE RULE IS THE BREAK, NOT THE COUNT. Three rows reading "ИГРАЙ В
 * ФУТБОЛ." / "КОГДА УГОДНО." / "ГДЕ УГОДНО." is the copy's own punctuation and
 * is correct. Three rows reading "…КОГДА УГОДНО. ГДЕ" / "УГОДНО." is the
 * defect, and it is one font-metric change away at any time.
 *
 * MEASURED AS "EVERY SENTENCE FITS ON A ROW", which is equivalent and is
 * deterministic. A greedy line-breaker can only split inside a sentence if
 * that sentence does not fit on a row of its own — so if each one fits, no row
 * can end mid-sentence, whatever the row count turns out to be.
 */
test("the hero headline breaks only at sentence boundaries, in every language", async ({
  browser,
}) => {
  for (const locale of ["en", "cs", "ru"] as const) {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
      ]);
      const page = await context.newPage();
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);

      const measured = await page.evaluate(() => {
        const h1 = document.querySelector('[data-testid="hero-headline"]') as HTMLElement;
        const style = getComputedStyle(h1);

        // A nowrap probe wearing the headline's own resolved font, so the
        // measurement survives a face swap, a clamp change and the Cyrillic
        // fallback alike.
        const probe = document.createElement("span");
        probe.style.cssText =
          `position:absolute;visibility:hidden;white-space:nowrap;` +
          `font:${style.font};letter-spacing:${style.letterSpacing};` +
          `text-transform:${style.textTransform}`;
        document.body.appendChild(probe);

        // Sentences, not words: the volt period is its own element, so the
        // text content is re-split on "." rather than trusting the markup.
        const sentences = (h1.textContent ?? "")
          .split(/(?<=\.)\s*/)
          .map((s) => s.trim())
          .filter(Boolean);

        const widths = sentences.map((s) => {
          probe.textContent = s;
          return Math.ceil(probe.getBoundingClientRect().width);
        });
        probe.remove();

        return { available: h1.getBoundingClientRect().width, sentences, widths };
      });

      for (const [i, sentence] of measured.sentences.entries()) {
        expect(
          measured.widths[i],
          `${locale} at ${width}px: "${sentence}" wraps mid-sentence ` +
            `(${measured.widths[i]}px in ${measured.available}px)`,
        ).toBeLessThanOrEqual(Math.ceil(measured.available));
      }
      await context.close();
    }
  }
});

/*
 * AND THE HERO DOES NOT REPEAT THE HEADER'S WORDMARK.
 *
 * Separate from the row count because it is a separate mistake: restoring the
 * brand line above the slogan would still leave the slogan at two rows.
 */
test("the hero does not repeat the wordmark", async ({ page }) => {
  await page.goto("/");
  const headline = await page.getByTestId("hero-headline").innerText();
  expect(headline.toUpperCase()).not.toContain("HRAJ FOTBAL");
});

/* And the grey sub-line under it is gone. */
test("the hero carries no vision sub-line", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero-vision")).toHaveCount(0);
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
            "community-panel",
            "potm-panel",
            "faq-panel",
          ].includes(t),
        ),
    );

    expect(order).toEqual([
      "how-it-works",
      "next-matches",
      "next-matches-all",
      "community-panel",
      "potm-panel",
      "faq-panel",
    ]);

    /*
     * PLAYER OF THE MONTH SURVIVES; THE EQUIPMENT LINE NO LONGER DOES.
     * Ruling J deleted both, the 2026-08-10 amendment restored both, and
     * Section 2 item 5 reverses the equipment half again. Asserted in both
     * directions so neither drifts back.
     */
    await expect(page.getByTestId("potm-panel")).toBeVisible();
    await expect(page.getByTestId("equipment-line")).toHaveCount(0);
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

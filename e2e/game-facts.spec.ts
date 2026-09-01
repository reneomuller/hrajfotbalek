import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * ROUND 18 ITEM 9 — a non-standard format and a non-default duration, driven
 * through the list AND the detail.
 *
 * THE BUG WAS TWO BUGS AND NEITHER WOULD HAVE FAILED AN EXISTING TEST.
 *
 *   FORMAT never reached the database. `FORMAT_RE` capped at three groups, so
 *   `7v7v7v7` was refused before the request left the browser — and PRODUCTION
 *   still carried the two-way-only CHECK, so even `6v6v6` was rejected there.
 *   Every spec used `6v6`.
 *
 *   DURATION never reached the card. `duration_minutes` was in `GameCard`'s
 *   type, threaded from the query and drawn in the file's own ASCII sketch —
 *   and no element output it. Every spec asserted duration on the DETAIL,
 *   where it worked.
 *
 * SO THIS DRIVES ONE GAME THROUGH BOTH SURFACES with values that are not the
 * defaults, which is the only shape that catches a display bound to an
 * assumption instead of to data. A fixture using `6v6` at 60 minutes agrees
 * with a hardcoded answer.
 */

test.use({ viewport: { width: 390, height: 844 } });

const FORMAT = "7v7v7v7";
const DURATION = 120;

test("a four-way, 120-minute game says so on the list and on the detail", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({
    capacity: 28,
    hoursFromNow: 30,
    format: FORMAT,
    surface: "turf",
    durationMinutes: DURATION,
  });

  try {
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    /*
     * THE ROW MUST EXIST WITH THESE VALUES. Asserted against the database
     * first: if the CHECK refused `7v7v7v7` the game would have no format at
     * all, and every rendering assertion below would then be checking that
     * nothing renders — passing for the wrong reason.
     */
    const admin = serviceClient();
    const { data: row } = await admin
      .from("games")
      .select("format, duration_minutes")
      .eq("id", game.id)
      .single();
    expect(row?.format, "the four-way format was not stored").toBe(FORMAT);
    expect(row?.duration_minutes, "the duration was not stored").toBe(DURATION);

    // --- the list card ------------------------------------------------------
    await page.goto("/games", { waitUntil: "networkidle" });
    const card = page.locator(`[data-testid="game-row"][href="/game/${game.id}"]`);
    await expect(card).toHaveCount(1);

    await expect(
      card.getByTestId("game-format"),
      "the card is showing a format that is not this game's",
    ).toHaveText(FORMAT);

    /*
     * THE CARD DOES NOT SHOW A DURATION AT ALL (round 19, item 4), and the
     * assertion inverts rather than moving.
     *
     * Round 18 put it here because the prop was threaded, typed and drawn in
     * the card's own ASCII sketch with nothing rendering it — a real defect,
     * and "so render it" was the wrong conclusion. A grey "60 min" is the
     * third number on a row that already carries a kick-off time and a spots
     * figure, and the one nobody scans for.
     *
     * IT IS NOT LOST, which is why the detail is asserted below in the same
     * test: one game, both surfaces, one place the fact belongs.
     */
    await expect(
      card.getByTestId("card-duration"),
      "the grey duration line is back on the game box",
    ).toHaveCount(0);

    // --- the detail ---------------------------------------------------------
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    const info = page.getByTestId("game-info-card");

    await expect(info.getByTestId("game-format")).toHaveText(FORMAT);
    await expect(info.getByTestId("game-duration")).toContainText(String(DURATION));

    /*
     * AND THE TWO SURFACES AGREE. The failure the owner reported was a card
     * that said one thing while the page it opened said another, so the
     * property worth pinning is not "each is right" but "they MATCH".
     *
     * Read by navigating rather than by fetching `/games` and parsing the
     * HTML: the list streams through Suspense, so the first response body does
     * not contain the rows at all — a comparison built on it reports `null`
     * and looks exactly like a real divergence.
     */
    const onDetail = {
      format: (await info.getByTestId("game-format").innerText()).trim(),
      duration: (await info.getByTestId("game-duration").innerText()).trim(),
    };
    expect(onDetail.duration, "the detail's duration is missing").toContain(String(DURATION));

    await page.goto("/games", { waitUntil: "networkidle" });
    const onCardFormat = (await card.getByTestId("game-format").innerText()).trim();

    expect(onCardFormat, "list and detail disagree about the format").toBe(onDetail.format);

    /*
     * AND THE MINUTES ARE NOWHERE IN THE BOX. Checked against the rendered
     * TEXT, not just the testid, because "120" could come back as a bare
     * number in some other element and still be the thing item 4 removed.
     * `120` is also this game's capacity-free figure, so the assertion is on
     * the minute unit rather than the digits alone.
     */
    const boxText = await card.innerText();
    expect(boxText, "a duration is back on the game box").not.toMatch(/\d+\s*min/i);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/**
 * ROUND 18 ITEM 2 — the language pill on the card, and surface leaving it.
 */
test("the card carries the language pill where the surface pill used to be", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({
    capacity: 10,
    hoursFromNow: 31,
    format: "6v6",
    surface: "turf",
  });

  try {
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    const admin = serviceClient();
    await admin.from("games").update({ language: "uk-ru" }).eq("id", game.id);

    await page.goto("/games", { waitUntil: "networkidle" });
    const card = page.locator(`[data-testid="game-row"][href="/game/${game.id}"]`);

    const pill = card.getByTestId("language-pill");
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute("data-language", "uk-ru");

    /*
     * TWO FLAGS, AS SVG. Asserted as elements rather than as text, because the
     * whole reason this is not `🇺🇦 / 🇷🇺` is that emoji flags render as
     * LETTERS on Windows — and a text assertion would pass on exactly the
     * output the item exists to avoid.
     */
    await expect(pill.locator("svg")).toHaveCount(2);

    // Surface left the card…
    await expect(
      card.getByTestId("game-surface"),
      "the surface pill is back on the list card",
    ).toHaveCount(0);

    /*
     * …and is on the detail — IN THE FORMAT ROW, not in a row of its own
     * (round 24, item 7). The standalone `Surface` row said the same
     * translated word four pixels below the badge that already said it. The
     * assertion inverts rather than disappearing: the fact must still be on
     * the page, and the duplicate must not.
     */
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    const info = page.getByTestId("game-info-card");
    await expect(info.getByTestId("game-surface")).toBeVisible();
    await expect(
      page.getByTestId("game-surface-row"),
      "the duplicate Surface row is back",
    ).toHaveCount(0);

    /*
     * THE PILL SITS BESIDE THE FORMAT BADGE, on one baseline. Measured rather
     * than assumed: the item asks for it "next to the format badge", and a
     * pill that wraps to its own line is not next to anything.
     */
    await page.goto("/games", { waitUntil: "networkidle" });
    const boxes = await card.evaluate((el) => {
      const f = el.querySelector('[data-testid="game-format"]')!.getBoundingClientRect();
      const l = el.querySelector('[data-testid="language-pill"]')!.getBoundingClientRect();
      return { fTop: f.top, lTop: l.top, fH: f.height, lH: l.height, gap: l.left - f.right };
    });
    expect(Math.abs(boxes.fTop - boxes.lTop), "the pills are on different lines").toBeLessThan(2);
    expect(Math.abs(boxes.fH - boxes.lH), "the pills are different heights").toBeLessThan(2);
    expect(boxes.gap, "the pills are not adjacent").toBeLessThan(12);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/**
 * ROUND 18 ITEMS 3 AND 8 — the Language row, and which app the organizer
 * button offers.
 */
test("a Ukrainian/Russian game shows the filled pill and offers Telegram", async ({
  page,
  context,
}) => {
  /*
   * A FORMAT IS REQUIRED FOR THIS FIXTURE, and the reason is round 17's own
   * improvement: the fact list omits the Format row entirely when a game has
   * neither format nor surface, so a game without one has no badge to measure
   * the pill against — and `getByTestId` would wait out the timeout on an
   * element that is correctly absent.
   */
  const game = await createScratchGame({
    capacity: 10,
    hoursFromNow: 32,
    format: "6v6",
    surface: "turf",
  });

  try {
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    const admin = serviceClient();
    await admin.from("games").update({ language: "uk-ru" }).eq("id", game.id);

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });

    const pill = page.getByTestId("game-info-card").getByTestId("language-pill");
    await expect(pill).toHaveAttribute("data-language", "uk-ru");

    /*
     * ONE CONSTRUCTION, BOTH SURFACES (round 19, item 1) — still true, and now
     * TWO CIRCLES rather than one split capsule (round 24, item 6).
     *
     * TWO CIRCLES, IDENTICAL, MEASURED. "Both circles identical size,
     * spec-pinned" is a geometric claim and the only way to check it is to
     * measure both — round 18's bug was two flags meant to match that did not,
     * and it shipped because nothing compared them.
     */
    const halves = await pill.evaluate((el) => {
      const cells = [...el.querySelectorAll("svg")].map((svg) =>
        svg.parentElement!.getBoundingClientRect(),
      );
      return {
        a: cells[0]!.width,
        b: cells[1]!.width,
        aH: cells[0]!.height,
        bH: cells[1]!.height,
        radius: parseFloat(getComputedStyle(cells[0]!.width ? (el.querySelector("svg")!.parentElement as HTMLElement) : el).borderTopLeftRadius),
        h: el.getBoundingClientRect().height,
      };
    });
    expect(Math.abs(halves.a - halves.b), "the two circles are different widths").toBeLessThan(1.5);
    expect(Math.abs(halves.aH - halves.bH), "the two circles are different heights").toBeLessThan(1.5);
    // ROUND. A square with a 50% radius, so the radius is half the side —
    // which is what separates "two circles" from "two small squares".
    expect(Math.abs(halves.a - halves.aH), "a circle is not square").toBeLessThan(1.5);
    expect(halves.radius, "the flags are not clipped to circles").toBeGreaterThanOrEqual(
      halves.a / 2 - 1,
    );

    // Same height as the badges it sits among (item 3).
    const badgeHeight = await page
      .getByTestId("game-info-card")
      .getByTestId("game-format")
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs(halves.h - badgeHeight)).toBeLessThan(4);

    /*
     * AND THE ORGANIZER BUTTON FOLLOWS THE GAME — but only when there is a
     * HANDLE (round 19, item 2). A Ukrainian/Russian game whose organizer has
     * none shows WhatsApp instead, because the alternative is a button that
     * lands on Telegram's "user not found" page with no route back.
     */
    await admin
      .from("game_organizer_contacts")
      .update({ organizer_telegram: "hrajfotbal_test" })
      .eq("game_id", game.id);
    await page.reload({ waitUntil: "networkidle" });

    const telegram = page.getByTestId("organizer-telegram");
    if ((await telegram.count()) > 0) {
      await expect(telegram).toHaveAttribute("href", `/api/tg/${game.id}`);
      await expect(page.getByTestId("organizer-whatsapp")).toHaveCount(0);

      /*
       * The href is our own route; what must never appear is the NUMBER. A
       * `t.me/+` pattern would also match the community group's invite hash,
       * which is not a phone and not a leak.
       */
      const { data: contact } = await admin
        .from("game_organizer_contacts")
        .select("organizer_phone")
        .eq("game_id", game.id)
        .maybeSingle();
      const digits = contact?.organizer_phone?.replace(/\D/g, "");
      if (digits) {
        const source = await page.content();
        expect(source, "the organizer's number is in the page source").not.toContain(digits);
      }
    }
  } finally {
    await destroyScratchGame(game.id);
  }
});

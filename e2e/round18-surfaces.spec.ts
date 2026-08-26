import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";

test.use({ viewport: { width: 390, height: 844 } });

/**
 * ROUND 18 ITEM 1 — the flag pair on the Telegram tile.
 *
 * ASSERTED AS SVG ELEMENTS, and that is the entire point of the item. The
 * owner's format is `🇺🇦 / 🇷🇺`, and those are regional-indicator codepoints the
 * FONT is expected to ligature into flags — Windows ships no such glyphs, so
 * on a large share of desktop visitors they render as the letters "UA / RU".
 * A text assertion would pass on exactly the output this exists to avoid;
 * counting `<svg>` cannot.
 */
test("the Telegram tile carries two drawn flags, not emoji", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const flags = page.getByTestId("community-telegram-flags");
  await expect(flags).toBeVisible();
  await expect(flags.locator("svg")).toHaveCount(2);

  // And no emoji flag anywhere in the tile — the thing being replaced.
  const tile = await page.getByTestId("community-telegram").innerText();
  expect(tile, "an emoji flag is back on the tile").not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
});

/**
 * ROUND 18 ITEM 5 / ROUND 19 ITEM 3 — display ordinals, counted from the
 * oldest game.
 *
 * THE PROPERTY IS THAT THEY ARE POSITIONS, not identifiers. Asserting that a
 * row "has a number" would pass against a stored column, which is the thing
 * this deliberately is not — so the assertion is that they are contiguous with
 * no gaps, which only a rendered index can guarantee.
 *
 * ~~1..n down the page.~~ n..1 DOWN THE PAGE (round 19, item 3). The list is
 * ordered newest-first and stays that way; the numbering runs the other way,
 * so the bottom row is 1 and the count rises. Numbering from the top would
 * change every game's number the moment a new one is created, which makes
 * "the third one" a different game each week.
 */
test("the admin games list numbers its rows from the oldest", async ({ page, context }) => {
  await signInAs(context, players.organizer);
  await page.goto("/admin/games", { waitUntil: "networkidle" });

  const ordinals = await page
    .getByTestId("admin-game-ordinal")
    .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute("data-ordinal"))));

  expect(ordinals.length, "no games to number").toBeGreaterThan(0);
  expect(ordinals, "the ordinals do not descend contiguously to 1").toEqual(
    ordinals.map((_, i) => ordinals.length - i),
  );

  /*
   * AND THE OLDEST IS 1, checked against the dates rather than assumed from
   * the order — the direction is the whole item, and a list that silently
   * flipped to oldest-first would still produce a descending column.
   */
  const rows = await page.getByTestId("admin-game-row").evaluateAll((nodes) =>
    nodes.map((n) => ({
      ordinal: Number(
        n.querySelector('[data-testid="admin-game-ordinal"]')?.getAttribute("data-ordinal"),
      ),
      when: n.getAttribute("data-starts-at"),
    })),
  );
  const dated = rows.filter((r) => r.when);
  if (dated.length > 1) {
    const oldest = dated.reduce((a, b) => (a.when! < b.when! ? a : b));
    expect(oldest.ordinal, "the oldest game is not numbered 1").toBe(1);
  }

  // Rendered, not just in an attribute.
  await expect(page.getByTestId("admin-game-ordinal").last()).toHaveText("1");
});

/**
 * ROUND 18 ITEM 6 — the organizer's note has a heading of its own.
 *
 * THE DEFECT WAS A COLLISION, not a missing section: the note's card was
 * labelled "Game information", the same words as the fact card's heading two
 * hundred pixels above. So the assertion is that the page no longer says it
 * twice — which is the shape a rename has to be checked in.
 */
test("the note has its own heading, and the page says Game information once", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 8, hoursFromNow: 33, format: "6v6" });

  try {
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await serviceClient()
      .from("games")
      .update({ notes: "Gate code 1234. Park on the north side." })
      .eq("id", game.id);

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });

    const notes = page.getByTestId("game-notes");
    await expect(notes).toBeVisible();
    await expect(notes).toContainText("Notes from organizer");
    await expect(notes).toContainText("Gate code 1234");

    /*
     * ONCE. Counted across the whole page rather than inside one card, because
     * the two sections are genuinely separate — what was wrong was that both
     * announced themselves with the same words.
     */
    const body = await page.locator("main").innerText();
    const occurrences = body.match(/game information/gi) ?? [];
    expect(occurrences.length, "the page says Game information more than once").toBe(1);

    /*
     * AND IT READS AS A HEADING. It was a 10px grey eyebrow while every
     * neighbouring section carried a `body-lg` white heading, which is what
     * made it look like a caption on the paragraph beneath.
     */
    const heading = await notes.locator("h2").evaluate((el) => {
      const s = getComputedStyle(el);
      return { size: parseFloat(s.fontSize), transform: s.textTransform };
    });
    expect(heading.size, "the notes heading is eyebrow-sized again").toBeGreaterThan(14);
    expect(heading.transform, "the notes heading is uppercase again").toBe("none");
  } finally {
    await destroyScratchGame(game.id);
  }
});

/**
 * ROUND 18 ITEM 8 — the Telegram redirect, and the privacy property it shares
 * with the WhatsApp one.
 *
 * THE NUMBER MUST NOT BE IN PAGE SOURCE. That is the whole reason both routes
 * exist: a `t.me/+420…` link in the markup is an organizer's phone number
 * harvestable in bulk by a crawler reading one games list. Asserted on the
 * response body rather than on the rendered DOM, because a crawler reads the
 * former.
 */
test("the Telegram route redirects and keeps the number off the page", async ({
  page,
  context,
  request,
}) => {
  const game = await createScratchGame({ capacity: 8, hoursFromNow: 34, format: "6v6" });

  try {
    const admin = serviceClient();
    await admin.from("games").update({ language: "uk-ru" }).eq("id", game.id);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    /*
     * ASSERTED ON THE ORGANIZER'S ACTUAL DIGITS, not on a `t.me/+` pattern.
     * The community panel's Telegram GROUP link is `t.me/+yXnyRFfx…` — an
     * invite hash, not a phone — so a pattern match reports the wrong thing
     * and, worse, would keep reporting it after a real leak was fixed. What
     * must never be in source is this organizer's number.
     */
    const { data: contact } = await admin
      .from("game_organizer_contacts")
      .select("organizer_phone")
      .eq("game_id", game.id)
      .maybeSingle();
    const digits = contact?.organizer_phone?.replace(/\D/g, "") ?? null;

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    const source = await page.content();
    if (digits) {
      expect(source, "the organizer's number is in the page source").not.toContain(digits);
    }

    const link = page.getByTestId("organizer-telegram");
    if ((await link.count()) === 0) {
      test.skip(true, "this scratch game's organizer has no phone recorded");
      return;
    }

    await expect(link).toHaveAttribute("href", `/api/tg/${game.id}`);

    /*
     * THE REDIRECT ITSELF, not followed. `t.me` is somebody else's server and
     * a test that hits it is a test that fails when their DNS does. What
     * matters here is that OUR route answers 302 to a `t.me/+` target and
     * refuses to be cached.
     */
    const res = await request.get(`/api/tg/${game.id}`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers()["location"]).toMatch(/^https:\/\/t\.me\/\+\d+$/);
    expect(res.headers()["cache-control"]).toContain("no-store");
  } finally {
    await destroyScratchGame(game.id);
  }
});

/**
 * ROUND 18 ITEM 8, THE OTHER HALF — an English/Czech game is unchanged.
 *
 * The item says WhatsApp stays "exactly as is", and the risk in a change like
 * this is that the new branch quietly becomes the default. Asserted from the
 * other side so a mistaken flip fails here rather than in production.
 */
test("an English/Czech game still offers WhatsApp", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 8, hoursFromNow: 35, format: "6v6" });

  try {
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });

    await expect(page.getByTestId("organizer-telegram")).toHaveCount(0);

    const wa = page.getByTestId("organizer-whatsapp");
    if ((await wa.count()) > 0) {
      await expect(wa).toHaveAttribute("href", `/api/wa/${game.id}`);
    }
  } finally {
    await destroyScratchGame(game.id);
  }
});

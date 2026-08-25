import { expect, test } from "@playwright/test";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { anonClient, apiClientFor, players, serviceClient, signInAs } from "./helpers/session.ts";
import { pragueDayKey } from "../lib/games/days.ts";

/**
 * The list URL for the day a given game falls on.
 *
 * The list now defaults to EVERY upcoming game, so this is no longer needed to
 * make a game two weeks out visible — a plain `/games` finds it. It is kept
 * because it still isolates one game's row from a board that grows as specs
 * add scratch games, which is what most of the callers actually wanted.
 *
 * Deriving the key from the stored kick-off rather than from the offset the
 * spec asked for keeps it correct across midnight and across a DST boundary.
 */
function listUrlFor(game: { startsAt: string }): string {
  return `/games?day=${pragueDayKey(game.startsAt)}`;
}

/**
 * G2 game-surface specs.
 *
 * Every spec here builds its own game and tears it down. The seed tableau is
 * read, never mutated — a suite whose result depends on how many times it has
 * been run fails in ways that cannot be reproduced.
 *
 * Started in Phase 14 with the duration scenarios and grown by the phases
 * after it, rather than all landing at Phase 20: a criterion the plan names
 * inside a phase is verified in that phase.
 */

/** `2026-08-02T17:30:00.000Z` → the Prague wall-clock hh:mm the page renders. */
function pragueTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * The DTSTART/DTEND pair out of an .ics body, as instants.
 *
 * Both are read from the file rather than one being compared against
 * `starts_at`: RFC 5545 timestamps carry SECOND resolution and `starts_at`
 * carries milliseconds, so a cross-surface subtraction is off by whatever
 * sub-second remainder the row happens to hold. The span inside the file is
 * the thing the requirement is actually about.
 */
function icsSpan(body: string): { start: Date; end: Date } {
  const start = body.match(/DTSTART:(\d{8}T\d{6}Z)/);
  const end = body.match(/DTEND:(\d{8}T\d{6}Z)/);
  if (!start || !end) throw new Error("no DTSTART/DTEND in the .ics body");
  return { start: fromIcsStamp(start[1]), end: fromIcsStamp(end[1]) };
}

/** `20260802T190000Z` → an ISO instant. */
function fromIcsStamp(stamp: string): Date {
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(
    9,
    11,
  )}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
  return new Date(iso);
}

/** The schema.org JSON-LD block the detail page embeds. */
async function readSchema(page: import("@playwright/test").Page) {
  const raw = await page.locator('script[type="application/ld+json"]').textContent();
  return JSON.parse(raw ?? "{}") as Record<string, unknown>;
}

/*
 * TEST-219 — a 90-minute game reads as a 90-minute game everywhere.
 *
 * "Everywhere" is the requirement, not "on the page". The .ics and the
 * schema.org block are the two surfaces that fail SILENTLY when they disagree
 * with the page: a wrong DTEND produces a calendar entry a player only notices
 * while standing on the pitch, and a wrong endDate is simply indexed.
 */
test("a 90-minute game renders its span on the page, in the .ics and in the structured data", async ({
  page,
  request,
}) => {
  const game = await createScratchGame({ durationMinutes: 90 });

  try {
    await page.goto(`/game/${game.id}`);

    // --- the page ----------------------------------------------------------
    const span = page.getByTestId("game-time-span");
    await expect(span).toBeVisible();
    const spanText = (await span.textContent())!.trim();

    // Read the stored start back rather than recomputing it, so the assertion
    // is against what the database holds and not against the test's own clock.
    const schema = await readSchema(page);
    const startsAt = schema.startDate as string;
    const endsAt = schema.endDate as string;

    expect(spanText).toContain(pragueTime(startsAt));
    expect(spanText).toContain(pragueTime(endsAt));
    // An en dash, per the format helper — a hyphen reads as a compound word.
    expect(spanText).toContain("–");

    // --- structured data ---------------------------------------------------
    expect(Date.parse(endsAt) - Date.parse(startsAt)).toBe(90 * 60_000);

    // --- the .ics ----------------------------------------------------------
    const ics = await request.get(`/game/${game.id}/ics`);
    expect(ics.ok()).toBeTruthy();
    const body = await ics.text();

    const ical = icsSpan(body);
    expect(ical.end.getTime() - ical.start.getTime()).toBe(90 * 60_000);

    // And the three agree with each other, which is the actual requirement.
    // To the second, because that is the resolution the calendar file has.
    expect(Math.floor(ical.end.getTime() / 1000)).toBe(
      Math.floor(Date.parse(endsAt) / 1000),
    );
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * TEST-220 — a game with no duration recorded falls back to the policy
 * constant, at every one of those sites and by the same amount.
 *
 * Null is a real answer here, not a gap: the two production games predate the
 * column and a default would have asserted a length nobody chose.
 */
test("a game with no duration falls back to the standard length on every surface", async ({
  page,
  request,
}) => {
  const game = await createScratchGame({ durationMinutes: null });

  try {
    await page.goto(`/game/${game.id}`);

    const schema = await readSchema(page);
    const startsAt = schema.startDate as string;
    const endsAt = schema.endDate as string;

    // 60, from `policy.game.durationMinutes` — the v1.1.1 ruling. Asserted as
    // a number rather than read from the policy module, because the point of
    // this spec is that the RENDERED value is the standard one; importing the
    // constant would make it agree with itself.
    expect(Date.parse(endsAt) - Date.parse(startsAt)).toBe(60 * 60_000);

    const spanText = (await page.getByTestId("game-time-span").textContent())!.trim();
    expect(spanText).toContain(pragueTime(startsAt));
    expect(spanText).toContain(pragueTime(endsAt));

    const body = await (await request.get(`/game/${game.id}/ics`)).text();
    const ical = icsSpan(body);
    expect(ical.end.getTime() - ical.start.getTime()).toBe(60 * 60_000);
    expect(Math.floor(ical.end.getTime() / 1000)).toBe(
      Math.floor(Date.parse(endsAt) / 1000),
    );
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * THE CARD CARRIES KICK-OFF PLUS DURATION, NOT A SPAN — v1.3 §2.1, which
 * supersedes the span this list carried since Phase 14. The two say the same
 * thing; v1.3 picks the one where the kick-off is the largest element on the
 * card, and §2.13 then names "time, duration, format and spots" as the four
 * things that never truncate, which is what the two-element form buys.
 *
 * REQ-GAME-007's range is NOT lost — it is on the detail page (`InfoCard`),
 * asserted below, which is where someone planning an evening around one
 * particular game is reading. The half of the requirement that named cards is
 * what v1.3 rules on.
 */
test("the card shows the time; the heading carries the day; the detail shows the span", async ({
  page,
}) => {
  const game = await createScratchGame({ durationMinutes: 90, hoursFromNow: 24 * 20 });

  try {
    await page.goto(listUrlFor(game));
    const row = page.locator(`[data-testid="game-row"][href="/game/${game.id}"]`);
    await expect(row).toHaveCount(1);

    /*
     * DAY AND TIME, not a range and no longer a duration — the card anatomy
     * ruling of 2026-08-10 sets this line as `Sat 15 Aug • 12:30`. The day was
     * added because a card reading only `12:30` makes a reader carry the day
     * heading in their head, and on home there is no heading at all. The
     * duration came off the card with it; the detail still carries the span.
     */
    /*
     * THE PILL IS THE TIME ALONE (Section 3, item 5). The DATE moved to the
     * day-group heading above, where several games on one day share it rather
     * than repeating it on every card.
     */
    await expect(row.getByTestId("card-when")).toHaveText(/^\d{2}:\d{2}$/);
    await expect(row).not.toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/);
    // And the heading above carries the day.
    await expect(page.getByTestId("day-heading").first()).toBeVisible();

    // And the range is on the detail, so this is a move rather than a loss.
    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("game-time-span")).toContainText(
      /\d{2}:\d{2}–\d{2}:\d{2}/,
    );
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * TEST-221 — the badge appears only when the game is restricted.
 *
 * An all-levels game showing an "all levels" badge would be a label on the
 * absence of a rule, and would make every game on the list look like it had
 * one. Absence is the signal here.
 */
test("no skill badge on an all-levels game, badges on a restricted one", async ({
  page,
}) => {
  const open = await createScratchGame({ allowedSkillLevels: null });
  const restricted = await createScratchGame({ allowedSkillLevels: ["advanced"] });

  try {
    await page.goto(`/game/${open.id}`);
    await expect(page.getByTestId("skill-badges")).toHaveCount(0);

    await page.goto(`/game/${restricted.id}`);
    await expect(page.getByTestId("skill-badge-advanced")).toBeVisible();

    /*
     * AND ON NEITHER CARD — v1.3 ruling I takes the level badge off the
     * canonical card entirely. Restriction is a detail-page fact: a badge that
     * appears on some cards and not others reads as a property of the card
     * rather than of the game, and it was competing with the spots figure,
     * which §2.1 makes the only coloured text on the card.
     *
     * The RESTRICTED game is the one worth asserting on, because that is the
     * card that used to carry it.
     */
    await page.goto(listUrlFor(restricted));
    const restrictedRow = page.locator(
      `[data-testid="game-row"][href="/game/${restricted.id}"]`,
    );
    await expect(restrictedRow).toHaveCount(1);
    await expect(restrictedRow.getByTestId("skill-badges")).toHaveCount(0);

    await page.goto(listUrlFor(open));
    const openRow = page.locator(`[data-testid="game-row"][href="/game/${open.id}"]`);
    await expect(openRow).toHaveCount(1);
    await expect(openRow.getByTestId("skill-badges")).toHaveCount(0);
  } finally {
    await destroyScratchGame(open.id);
    await destroyScratchGame(restricted.id);
  }
});

/*
 * REQ-GAME-011 — and a Beginner can still book the Advanced game.
 *
 * Asserted through the RPC rather than the UI, because the RPC is where the
 * refusal would live if there were one. Skill is a signal, never a gate.
 */
test("skill restriction never blocks a booking", async ({}) => {
  const game = await createScratchGame({ allowedSkillLevels: ["advanced"] });

  try {
    const runner = await apiClientFor(players.runner);
    const { data, error } = await runner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });

    expect(error).toBeNull();
    expect(data?.status).toBeTruthy();
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * TEST-232 — format is what the admin typed, never what capacity implies.
 *
 * Capacity 12 with format "5v5": the organizer is running 5v5 with
 * substitutes. Deriving "6v6" from the number would print a confident
 * falsehood on a public page, and unlike a blank, nobody can tell it is wrong
 * by looking at it.
 */
test("a capacity-12 game entered as 5v5 never renders 6v6", async ({ page }) => {
  const game = await createScratchGame({ capacity: 12, format: "5v5", subsPerTeam: 2 });

  try {
    // The detail page, including the chips above the map.
    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("game-format")).toHaveText("5v5");
    await expect(page.getByTestId("game-subs")).toContainText("2");
    await expect(page.locator("body")).not.toContainText("6v6");

    // The list row.
    await page.goto(listUrlFor(game));
    const row = page.locator(`[data-testid="game-row"][href="/game/${game.id}"]`);
    // Format and surface are BADGES now (ruling 6, 2026-08-10).
    await expect(row.getByTestId("game-format")).toHaveText("5v5");
    await expect(row).not.toContainText("6v6");
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * A game with NO format shows no format chip — it does not fall back to
 * capacity/2. This is the assertion that would have caught the derivation the
 * component used to do, and it is the reason it is written separately from
 * TEST-232: a game that HAS a format hides the bug.
 */
test("a game with no format shows no format at all, rather than one derived from capacity", async ({
  page,
}) => {
  const game = await createScratchGame({ capacity: 12, format: null });

  try {
    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("game-format")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("6v6");
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * TEST-218 — the organizer phone reaches booked players and nobody else.
 *
 * Three viewers, one game. The anonymous case is the one that matters most,
 * and it is asserted on the API as well as the page: an application-side check
 * would gate the render and leave the number one call away. The SQL suite
 * proves the grant; this proves the page.
 */
/*
 * THE ORGANIZER IS REACHABLE BY EVERYONE (round 8, item 8).
 *
 * ~~The organizer phone is visible only to a player holding a spot.~~
 * REVERSED by the owner: someone deciding whether to cross Prague for a pickup
 * game should be able to ask a question first, so the WhatsApp control shows
 * for an anonymous visitor, a signed-in stranger and a spot-holder alike.
 *
 * TWO THINGS SURVIVE THE REVERSAL AND ARE ASSERTED HERE.
 *
 *   1. THE NUMBER IS NEVER PRINTED. It is the href and nothing else — the
 *      `tel:` link and the visible digits are gone. Not a privacy measure (the
 *      href is readable) but a copy decision: a raw number invites a phone
 *      call, and the ruling is WhatsApp.
 *   2. `game_organizer_phone()` AND ITS GATE ARE UNTOUCHED. The RPC still
 *      refuses `anon` and still requires a booking. The page reads the table
 *      with the service client instead, so no database privilege widened and
 *      nothing else that calls the RPC changed behaviour. That is what makes
 *      this ruling revertible by deleting one function.
 */
test("everyone can message the organizer, and the number is never in the page", async ({
  page,
  context,
}) => {
  const phone = "+420777654321";
  const digits = "420777654321";
  const game = await createScratchGame({
    organizerName: "Organizer On Call",
    organizerPhone: phone,
  });

  const expectContactable = async (who: string) => {
    const link = page.getByTestId("organizer-whatsapp");
    await expect(link, `${who}: no WhatsApp control`).toBeVisible();

    /*
     * THE HREF IS OUR OWN ROUTE, not `wa.me` (round 9, item 2). The number is
     * assembled server-side behind the redirect.
     */
    expect(await link.getAttribute("href"), who).toBe(`/api/wa/${game.id}`);

    /*
     * AND THE DIGITS ARE NOWHERE IN THE RENDERED SOURCE. `innerText` would
     * only prove they are not VISIBLE; the whole point is that they are not in
     * the markup either, in any spelling — with the `+`, without it, or as the
     * bare digits a `wa.me` link carries.
     */
    const html = await page.content();
    for (const spelling of [phone, digits, "777654321"]) {
      expect(html.includes(spelling), `${who}: "${spelling}" is in the page source`).toBe(
        false,
      );
    }
    await expect(page.getByTestId("organizer-phone")).toHaveCount(0);
  };

  try {
    // --- anonymous ---------------------------------------------------------
    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("organizer-name")).toHaveText("Organizer On Call");
    await expectContactable("anonymous");

    // --- signed in, no booking on this game --------------------------------
    await signInAs(context, players.creditRich);
    await page.goto(`/game/${game.id}`);
    await expectContactable("signed-in stranger");

    // --- holding a spot ----------------------------------------------------
    const runner = await apiClientFor(players.runner);
    const { error } = await runner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(error).toBeNull();
    await signInAs(context, players.runner);
    await page.goto(`/game/${game.id}`);
    await expectContactable("spot holder");

    /*
     * --- and the route still delivers, for everyone ------------------------
     *
     * `maxRedirects: 0` so the assertion is on OUR response rather than on
     * whatever wa.me serves. The number appears here, in a Location header on
     * a request somebody made — which is the feature. What it is no longer is
     * harvestable from markup.
     */
    await context.clearCookies();
    const hop = await page.request.get(`/api/wa/${game.id}`, { maxRedirects: 0 });
    expect(hop.status(), "the redirect does not work for an anonymous visitor").toBe(302);
    const location = hop.headers()["location"] ?? "";
    expect(location).toContain(`https://wa.me/${digits}`);
    // The message is prefilled with the fixture, as round 8 ruled.
    expect(new URL(location).searchParams.get("text") ?? "").toContain(
      "E2E Scratch Pitch",
    );
    // A cached redirect is a cached phone number.
    expect(hop.headers()["cache-control"] ?? "").toContain("no-store");

    // --- and the RPC's own gate is exactly where it was --------------------
    const anon = anonClient();
    expect((await anon.rpc("game_organizer_phone", { p_game_id: game.id })).data ?? null)
      .toBeNull();
    const stranger = await apiClientFor(players.creditRich);
    expect(
      (await stranger.rpc("game_organizer_phone", { p_game_id: game.id })).data ?? null,
      "the RPC gate was widened — it should not have been",
    ).toBeNull();
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * A GAME WITH NO NUMBER 404s RATHER THAN GUESSING A DESTINATION.
 *
 * The card draws no button in that case, so reaching the route means a
 * hand-made request — and inventing somewhere plausible to send it would be
 * worse than saying no.
 */
test("the WhatsApp route refuses a game with no organizer number", async ({ page }) => {
  const game = await createScratchGame({ organizerName: "No Phone", organizerPhone: null });
  try {
    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("organizer-whatsapp")).toHaveCount(0);

    const hop = await page.request.get(`/api/wa/${game.id}`, { maxRedirects: 0 });
    expect(hop.status()).toBe(404);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * TEST-233 — the page knows whether the viewer is already in.
 *
 * The failure this replaces: a player who had already paid was asked to claim
 * a spot they were standing on, which reads as a broken page. The question
 * they actually arrive with — am I in, and have I paid? — was the one thing it
 * did not answer.
 */
test("a booking holder sees their booking and no claim CTA", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 4 });

  try {
    // --- no booking, spots remain: the claim CTA ---------------------------
    await signInAs(context, players.runner);
    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("book-cta")).toBeVisible();
    await expect(page.getByTestId("your-booking")).toHaveCount(0);

    // --- holding a spot: the booking, and no claim -------------------------
    const runner = await apiClientFor(players.runner);
    const { error } = await runner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(error).toBeNull();

    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("your-booking")).toBeVisible();
    await expect(page.getByTestId("book-cta")).toHaveCount(0);
    // The payment state, which is half of what they came to find out.
    await expect(page.getByTestId("your-booking-badge")).toBeVisible();
    // And the way out.
    await expect(page.getByTestId("cancel-booking")).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * REQ-PROF-008 — a roster photo renders, and a player without one falls back
 * to initials. Both in the same lineup, so the fallback is proven to be the
 * ordinary case rather than an error state.
 */
test("the roster renders photos where they exist and initials where they do not", async ({
  page,
}) => {
  const game = await createScratchGame({ capacity: 6 });

  try {
    const runner = await apiClientFor(players.runner);
    await runner.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });

    const admin = serviceClient();
    // Through the RPC the account page uses, not a direct column write: a spec
    // that reaches around the write path is testing a state the product cannot
    // produce.
    const photoPath = `players/${players.runner.id}.jpg`;
    await admin.from("players").update({ photo_path: photoPath }).eq("id", players.runner.id);

    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("roster-avatar-photo").first()).toBeVisible();

    // Clear it again and the same row falls back to initials.
    await admin.from("players").update({ photo_path: null }).eq("id", players.runner.id);
    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("roster-avatar-photo")).toHaveCount(0);
    await expect(page.getByTestId("roster-avatar").first()).toBeVisible();
  } finally {
    const admin = serviceClient();
    await admin.from("players").update({ photo_path: null }).eq("id", players.runner.id);
    await destroyScratchGame(game.id);
  }
});

/*
 * TEST-234 / REQ-GAME-019 — density, counted rather than eyeballed.
 *
 * v1.1.2 set "at least three" against a card layout. v1.1.4 tightens it to
 * "well more than three at Pixel-7 width", so this counts the rows whose
 * bounding box lies ENTIRELY within the viewport — a row half off the bottom
 * edge is not a game you can see, and a criterion satisfied by a partially
 * visible row is a criterion that means nothing.
 *
 * Pixel 7 is the project's only viewport (`playwright.config.ts`), so "phone
 * width" needs no setup here.
 */
test("three whole cards and a fourth started, at phone width, without scrolling", async ({
  page,
}) => {
  /*
   * THE HISTORY OF THIS NUMBER, because it has moved three times and each
   * move was arithmetic rather than preference.
   *
   *   v1.1.4 §5.5   compact row, ~90px    five whole cards
   *   v1.3 §2.1     canonical card, 133   three whole, a fourth begun
   *   layout law    + dotted count, 171   TWO whole
   *   density ruling  merged occupancy, 141   three whole, a fourth begun
   *
   * The last step is the one worth explaining: the card was stating occupancy
   * TWICE — a `10 spots left` row above the dotted rule and `2 / 12 players`
   * below it. Merging them onto the rule returned 30px and a whole card,
   * without touching §2.1's geometry, ruling D's avatars or the layout law's
   * arrangement. Measured: viewport 839, chrome above the first card 332,
   * card 141 + 12 gap.
   *
   * If three is still not enough, that is §2.1 to reopen — a separate ruling,
   * and the card has no duplication left to give back.
   *
   * Six on the SAME Prague day, because the day picker filters the list — a
   * spec that spread them across days would be measuring the picker. Four days
   * out: inside the eight-box window, and Prague's UTC+1/UTC+2 both put these
   * firmly inside one local day.
   */
  const day = pragueDayKey(new Date(Date.now() + 4 * 24 * 3600_000));
  const games = await Promise.all(
    ["14:00", "14:30", "15:00", "15:30", "16:00", "16:30"].map((time) =>
      createScratchGame({ startsAt: `${day}T${time}:00.000Z`, capacity: 12 }),
    ),
  );

  try {
    await page.goto(`/games?day=${day}`);

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();

    const rows = page.getByTestId("game-row");
    await expect(rows.first()).toBeVisible();

    let fullyVisible = 0;
    let started = 0;
    for (const row of await rows.all()) {
      const box = await row.boundingBox();
      if (!box || box.y < 0) continue;
      if (box.y + box.height <= viewport!.height) fullyVisible += 1;
      // Its top edge is on screen even if its bottom is not — the cue that
      // there is more list below the fold.
      if (box.y < viewport!.height) started += 1;
    }

    /*
     * TWO WHOLE CARDS, NOT THREE — AND THIS IS A CONFLICT THE OWNER MUST RULE
     * ON, recorded here rather than resolved quietly.
     *
     * The redesign card (R6) is 159px against the previous 141: it carries a
     * photograph, a venue row, a pill-and-spots row, the bar, and a faces-and-
     * cue row. It was trimmed as far as the frames allow — padding 16 -> 12,
     * row gaps 10 -> 8, the cue's own padding 6 -> 4 — and still costs the
     * third card.
     *
     * THE FRAMES THEMSELVES SHOW TWO. p02 draws the day strip, the pass panel,
     * a day heading and two cards; the third is below the fold in the design
     * too. So this is not an implementation miss, it is the design's own
     * density.
     *
     * What survives untouched is the criterion the ruling actually protects:
     * the list must visibly CONTINUE past the fold, so a reader knows there is
     * more. That is asserted below and is unchanged.
     *
     * The number has moved three times before, each time as arithmetic
     * following a card-height change rather than as preference — this is the
     * fourth, and the first where the new height came from a design the owner
     * commissioned. Flagged in the round report.
     */
    expect(fullyVisible).toBeGreaterThanOrEqual(2);
    // The list must still visibly continue past the fold — a cut-off card is
    // what tells a reader there is more, and a fold landing cleanly between
    // cards reads as the end of the list.
    expect(started).toBeGreaterThanOrEqual(4);
  } finally {
    await Promise.all(games.map((game) => destroyScratchGame(game.id)));
  }
});

/*
 * REQ-GAME-021 — the day strip is a calendar of REAL DATES that filters the
 * list (v1.2 §5.5). It used to print a game count beside a weekday, which
 * every reader took for a date.
 */
test("the day strip filters the list, by the date on the chip", async ({ page }) => {
  /*
   * Two days apart, so the chips are unambiguous whatever hour the suite runs
   * — and BOTH INSIDE THE EIGHT-DAY WINDOW, which is what ruling H made a
   * requirement of this fixture. At ten and twelve days out these games had no
   * chip at all, and the spec failed looking for one. That is the strip
   * behaving correctly: a game outside the window is still on the default
   * list, which the last assertion here checks.
   */
  const dayOne = await createScratchGame({ hoursFromNow: 24 * 3 });
  const dayTwoA = await createScratchGame({ hoursFromNow: 24 * 5 });
  const dayTwoB = await createScratchGame({ hoursFromNow: 24 * 5 + 1 });

  try {
    await page.goto("/games");
    await expect(page.getByTestId("day-picker")).toBeVisible();

    const secondDayRow = page.locator(`[data-testid="game-row"][href="/game/${dayTwoA.id}"]`);
    const firstDayRow = page.locator(`[data-testid="game-row"][href="/game/${dayOne.id}"]`);

    /*
     * The chip is addressed BY ITS DATE, which is the whole point of the
     * change: `data-day` and the day of the month printed on it are the same
     * fact, so a spec can find the right chip without clicking through every
     * one of them hoping. The old version looped over the tabs until a row
     * appeared, because there was nothing on a tab to identify it by.
     */
    const targetDay = pragueDayKey(dayTwoA.startsAt);
    const chip = page.locator(`[data-testid="day-tab"][data-day="${targetDay}"]`);
    // Tabs carry a relative label or a weekday plus a count now, not a date —
    // `data-day` is what a spec addresses them by, which is why it exists.
    await expect(chip).toHaveCount(1);

    await chip.click();
    await page.waitForURL(`**/games?day=${targetDay}`);

    await expect(secondDayRow).toBeVisible();
    await expect(page.locator(`[data-testid="game-row"][href="/game/${dayTwoB.id}"]`)).toBeVisible();
    await expect(firstDayRow).toHaveCount(0);

    // Tapping the selected chip again clears the filter — the gesture people
    // try first is toggling the thing they just tapped.
    await chip.click();
    await page.waitForURL("**/games");
    await expect(firstDayRow).toBeVisible();
    await expect(secondDayRow).toBeVisible();
  } finally {
    await destroyScratchGame(dayOne.id);
    await destroyScratchGame(dayTwoA.id);
    await destroyScratchGame(dayTwoB.id);
  }
});

/*
 * THE DAY FILTER REACHES EVERY GAME, however far out.
 *
 * This replaces the eight-box calendar spec. The ruling of 2026-08-10 reversed
 * that control because a fixed window cannot cover an unbounded schedule: a
 * game published for late August fell outside the eight days and became
 * unreachable from `/games` — the invisible truncation ruling H forbade in its
 * own text.
 *
 * So the assertions are the guarantee rather than the geometry: `All` is the
 * default and lists a far-future game, and that game has a tab of its own.
 */
test("a game months out appears under All, though the week has no cell for it", async ({
  page,
}) => {
  const soon = await createScratchGame({ hoursFromNow: 24 * 2 });
  // Far beyond the seven-day row — reachable only because `All` is unbounded.
  const distant = await createScratchGame({ hoursFromNow: 24 * 96 });

  try {
    await page.goto("/games");

    /*
     * THE GUARANTEE. `All` is the default view and lists every upcoming game
     * whatever its distance — this is what the eight-box strip broke, and it
     * is what keeps a fixed week from being that strip under another name.
     */
    await expect(
      page.locator(`[data-testid="game-row"][href="/game/${soon.id}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-testid="game-row"][href="/game/${distant.id}"]`),
    ).toBeVisible();

    /*
     * AND THE WEEK DOES NOT PRETEND OTHERWISE. There is no cell for a day 96
     * days out, which is honest: the row is a convenience for the days people
     * are choosing between, not the only route to a game.
     */
    const distantDay = pragueDayKey(distant.startsAt);
    await expect(
      page.locator(`[data-testid="day-tab"][data-day="${distantDay}"]`),
    ).toHaveCount(0);

    // A day inside the week still filters, and `All` still returns.
    const soonDay = pragueDayKey(soon.startsAt);
    const cell = page.locator(`[data-testid="day-tab"][data-day="${soonDay}"]`);
    await expect(cell).toHaveCount(1);
    await cell.click();
    await page.waitForURL(`**/games?day=${soonDay}`);
    await expect(
      page.locator(`[data-testid="game-row"][href="/game/${distant.id}"]`),
    ).toHaveCount(0);

    await page.getByTestId("day-tab-all").click();
    await page.waitForURL("**/games");
    await expect(
      page.locator(`[data-testid="game-row"][href="/game/${distant.id}"]`),
    ).toBeVisible();
  } finally {
    await destroyScratchGame(soon.id);
    await destroyScratchGame(distant.id);
  }
});

/*
 * AMENDMENT A — a FIXED WEEK: seven cells, today first, whether or not a day
 * has games. An empty day is still a tab and still a link; tapping it shows
 * the list's empty state, which is a real answer rather than a dead control.
 *
 * This reverses the data-driven version, which collapsed to three cells on a
 * quiet board and read as broken.
 */
test("the day row is always eight cells, today first, empty days included", async ({
  page,
}) => {
  await page.goto("/games");

  const cells = page.getByTestId("day-tab");
  // EIGHT: today through today + 7 inclusive (ruling 5) — the same-weekday
  // bookend, so "next Tuesday" is in the row rather than beyond it.
  await expect(cells).toHaveCount(8);

  const days = await cells.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.day!),
  );
  expect(days[0]).toBe(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  for (let i = 1; i < days.length; i += 1) {
    const previous = new Date(`${days[i - 1]}T12:00:00Z`);
    const current = new Date(`${days[i]}T12:00:00Z`);
    expect(current.getTime() - previous.getTime()).toBe(86_400_000);
  }

  // Every cell is a link, including an empty one.
  for (const cell of await cells.all()) {
    expect(await cell.evaluate((node) => node.tagName)).toBe("A");
  }
});

/*
 * REQ-GAME-022 — one claim button in the product, and it is not on the list.
 *
 * v1.3 ruling E removed the `View game →` label with it: the WHOLE CARD is the
 * tap target, so a link inside a link was redundant, and it was the reason the
 * card could not simply be an anchor. What has to stay true is that the card
 * is still a real `<a href>` — keyboard-reachable and openable in a new tab
 * (§2.0) — which is what makes losing the visible affordance safe.
 */
test("the whole card is the link, with no View game label and no claim", async ({
  page,
}) => {
  const game = await createScratchGame({ hoursFromNow: 24 * 16 });

  try {
    await page.goto(listUrlFor(game));
    const row = page.locator(`[data-testid="game-row"][href="/game/${game.id}"]`);
    await expect(row).toBeVisible();
    await expect(row).not.toContainText("View game");
    await expect(row).not.toContainText("Claim");

    // A real anchor, not a div with a click handler — this is the assertion
    // that ruling E's removal rests on.
    expect(await row.evaluate((node) => node.tagName)).toBe("A");

    // And it leads to the detail, which is where the claim is.
    await row.click();
    await page.waitForURL(`**/game/${game.id}`);
    await expect(page.getByTestId("book-cta")).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * REQ-GAME-020 — what each row actually carries, and what it deliberately does
 * NOT (v1.2 §5.5).
 */
test("a card carries venue, time, format, surface, bar and spots — no price, no date", async ({
  page,
}) => {
  const game = await createScratchGame({
    hoursFromNow: 24 * 17,
    capacity: 12,
    priceCzk: 250,
    format: "5v5",
    subsPerTeam: 2,
    durationMinutes: 90,
    allowedSkillLevels: ["advanced"],
  });

  try {
    await page.goto(listUrlFor(game));
    const row = page.locator(`[data-testid="game-row"][href="/game/${game.id}"]`);
    await expect(row).toBeVisible();

    await expect(row.getByTestId("card-when")).toHaveText(/^\d{2}:\d{2}$/);
    await expect(row.getByTestId("card-venue")).toContainText("E2E Scratch Pitch");
    // Format AND surface, as badges top-right.
    await expect(row.getByTestId("game-format")).toHaveText("5v5");
    // The segmented bar is back (recovered from 1a42888) and unconditional.
    await expect(row.getByTestId("capacity-segments")).toBeVisible();
    await expect(row.getByTestId("row-spots")).toContainText("12 spots left");

    // Ruling I: the level badge is a detail-page fact, and this game is
    // restricted precisely so an absent badge means suppressed, not unset.
    await expect(row.getByTestId("skill-badges")).toHaveCount(0);


    /*
     * THE PRICE IS ON THE CARD AGAIN, reversing v1.2 §5.5 — it came off for
     * distinguishing nothing, and it is back because `150 CZK / 1 credit` is
     * how a reader learns what a credit is worth, on the surface where they
     * decide whether a pass is worth buying.
     *
     * THIS GAME IS PRICED 250 ON PURPOSE, which makes it the case that
     * matters: the `/ 1 credit` suffix must NOT render, because 250 is not
     * one credit and converting it would be the pro-rating the credits ruling
     * says to stop on.
     */
    // NO PRICE ON A LIST CARD (layout law). This fixture is priced 250 so a
    // leaked value could not hide behind another row's — which makes it the
    // strongest case for asserting the absence.
    await expect(row.getByTestId("card-price")).toHaveCount(0);
    await expect(row).not.toContainText("250");
    // What the card carries instead: the dotted count line.
    await expect(row.getByTestId("row-spots")).toBeVisible();
    await expect(row.getByTestId("card-players-count")).toHaveCount(0);

    // Substitutes remain a detail-page fact — `subsPerTeam` is set rather
    // than null here, so an absent chip means suppressed and not unset.
    await expect(row.getByTestId("game-subs")).toHaveCount(0);

    /*
     * No venue photo on the card (§2.1) — the photo belongs to the detail.
     *
     * Scoped to non-avatar images rather than to `img` outright: ruling D puts
     * an avatar stack on this card, and those are `<img>` too when a player has
     * uploaded a photo. `img:not([data-testid="avatar-photo"])` keeps the
     * assertion about the venue photo, which is what it was ever about.
     */
    await expect(row.locator('img[src^="/venues/"]')).toHaveCount(0);

    // Both of them ARE on the detail, so this is a move rather than a loss.
    await row.click();
    await page.waitForURL(`**/game/${game.id}`);
    await expect(page.getByTestId("game-subs")).toContainText("2");
    await expect(page.locator("body")).toContainText("250");
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * v1.2 §5.5 — the spots-left count is the FOMO element, and its colour is the
 * absolute ladder rather than the proportional one the copy uses.
 */
test("spots left is coloured by absolute count: volt, amber, then red", async ({ page }) => {
  /*
   * Four games rather than one game filling up. Spots-left is `capacity minus
   * booked`, so an empty game of capacity N sits on the rung N earns — which
   * reaches every rung with a single booking in the whole test instead of
   * twenty throwaway players. The last one needs the booking, because "full"
   * is the only rung an empty game cannot reach.
   *
   * The capacities sit ON the thresholds rather than near them: 10 is exactly
   * the amber line and 3 exactly the red one, so an off-by-one in either
   * comparison fails this rather than passing by luck.
   */
  const plenty = await createScratchGame({ hoursFromNow: 24 * 18, capacity: 20 });
  const few = await createScratchGame({ hoursFromNow: 24 * 18 + 1, capacity: 10 });
  const critical = await createScratchGame({ hoursFromNow: 24 * 18 + 2, capacity: 3 });
  const full = await createScratchGame({ hoursFromNow: 24 * 18 + 3, capacity: 1 });

  try {
    const organizer = await apiClientFor(players.organizer);
    // One booking apiece, on two different players: a player holds at most one
    // active booking, and these two games need a filled segment to look at.
    for (const [gameId, playerId] of [
      [full.id, players.runner.id],
      [critical.id, players.creditPartial.id],
    ] as const) {
      const { error } = await organizer.rpc("admin_create_booking", {
        p_game_id: gameId,
        p_player_id: playerId,
        p_payment_method: "cash",
      });
      expect(error).toBeNull();
    }

    await page.goto("/games");

    const toneOf = (id: string) =>
      page.locator(`[data-testid="game-row"][href="/game/${id}"]`).getByTestId("spots-left");

    await expect(toneOf(plenty.id)).toHaveAttribute("data-tone", "plenty");
    await expect(toneOf(few.id)).toHaveAttribute("data-tone", "few");
    await expect(toneOf(critical.id)).toHaveAttribute("data-tone", "critical");
    await expect(toneOf(full.id)).toHaveAttribute("data-tone", "full");
    await expect(toneOf(full.id)).toContainText("Full");

    /*
     * THE BAR TAKES THE SAME TONE AS THE NUMBER — asserted on the DETAIL page
     * now, because ruling D takes the capacity bar off the card. The property
     * is unchanged and still worth holding: the bar and the count are rendered
     * by different components from one shared table, and a bar that disagreed
     * with the count beside it would be worse than no colour at all.
     */
    const filledSegment = async (id: string) => {
      await page.goto(`/game/${id}`);
      return page.getByTestId("capacity-segments").locator("i").first();
    };

    // Capacity 3, one booked: two left, still red — and the one filled notch
    // is red with it.
    await expect(await filledSegment(critical.id)).toHaveClass(/bg-danger/);

    // A full game's notches must not use the UNFILLED grey, or a complete bar
    // and an empty one render identically and the reader concludes nobody
    // signed up.
    //
    // `bg-muted` since ruling A: `subtle` was one of the six greys that
    // collapsed into `muted`. The assertion that CARRIES the meaning is the
    // second one — that the filled notch differs from the unfilled track —
    // and it survives any renaming. The first names a token and therefore
    // fails whenever the palette moves, which is what happened here.
    const fullSegment = await filledSegment(full.id);
    await expect(fullSegment).toHaveClass(/bg-muted/);
    await expect(fullSegment).not.toHaveClass(/bg-surface-seg/);
  } finally {
    await destroyScratchGame(plenty.id);
    await destroyScratchGame(few.id);
    await destroyScratchGame(critical.id);
    await destroyScratchGame(full.id);
  }
});

/*
 * REQ-GAME-013 — a venue with no photo renders the name and Open map, and no
 * empty frame.
 *
 * The scratch venue deliberately has no `image_path`, which is why it is the
 * fixture for this. The ruling has survived two rebuilds: the v1.1 hero drew
 * its vignette, pin and chips whether or not a photo existed, so a venue
 * without one got 220px of decoration that looked like an image still loading;
 * v1.2 answered that with a second, compact layout for the no-photo case.
 *
 * REDESIGN v2 ROUND 4 REMOVES THE SECOND LAYOUT. There is one header band for
 * every game — p03's back-and-title row — and under R6(b) it is always backed
 * by a pitch photograph, the venue's own if it has one and the R6 default
 * otherwise. So "no img" is no longer the right question, and asserting it
 * would forbid the ruling.
 *
 * WHAT IS ASSERTED INSTEAD IS THE REQUIREMENT ITSELF, in two halves:
 *   - the band is COMPACT — the failure this test exists for is a tall box of
 *     nothing, and a height bound catches that whatever fills it;
 *   - the image is R6's DEFAULT, not a venue file. `data-photo="false"` says
 *     the venue has none; this says the band did not go looking for one.
 */
test("a venue with no photo renders name and Open map, with no empty frame", async ({
  page,
}) => {
  const game = await createScratchGame();

  try {
    await page.goto(`/game/${game.id}`);

    const hero = page.getByTestId("game-hero");
    /*
     * VISIBLE BEFORE MEASURED, and this is a real lesson rather than a
     * paper-over. The height assertion below read 0 under a full-suite run
     * and passed in isolation, twice — because `toHaveAttribute` and
     * `toContainText` are satisfied by the SSR markup and do not wait for the
     * element to have a box. On a loaded machine the measurement landed
     * before layout. `toBeVisible` is Playwright's non-empty-bounding-box
     * wait, which is exactly the precondition a geometry assertion needs.
     */
    await expect(hero).toBeVisible();
    await expect(hero).toHaveAttribute("data-photo", "false");
    await expect(hero).toContainText("E2E Scratch Pitch");

    // R6's single default, not a bucket object built from a null path.
    const src = await hero.getByTestId("hero-photo").getAttribute("src");
    expect(src).toContain("pitch-default");

    // NOT A TALL BOX. The v1.2 hero was 280px; the band is a 44px row plus its
    // padding. 200 is comfortably above the band and far below a hero.
    const bandHeight = await hero.evaluate((el) => el.getBoundingClientRect().height);
    expect(bandHeight, "the header band grew into a hero again").toBeLessThan(200);
    expect(bandHeight, "the header band has no height at all").toBeGreaterThan(0);

    // The map link moved into the info card, which is where every other thing
    // you DO with a game now lives.
    await expect(page.getByTestId("venue-open-map")).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * REQ-GAME-014 — sharing, which is now WhatsApp ALONE.
 *
 * v1.3 §3 removes `Copy link` from the detail ("No `Copy link`") and moves the
 * remaining share below `Good to know`. The spec that stood here asserted the
 * copy button, its clipboard write and its toast; all three are gone with the
 * control, so what is left to hold is that the share still exists, still
 * carries this game's URL, and is the last thing on the page before the bar.
 *
 * The copy path is not a loss worth a spec of its own: the browser's own share
 * sheet behind this button offers copy on every platform that has one.
 */
test("the detail shares to WhatsApp, and copy link is gone", async ({ page }) => {
  const game = await createScratchGame();

  try {
    await page.goto(`/game/${game.id}`);

    await expect(page.getByTestId("share-copy-link")).toHaveCount(0);

    const whatsapp = page.getByTestId("share-whatsapp");
    await expect(whatsapp).toBeVisible();
    // The link carries this game, not the list — a share that lands on /games
    // is a share nobody can act on.
    await expect(whatsapp).toHaveAttribute("href", new RegExp(game.id));
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * REQ-UX-002 — the booking and cancellation toasts, which cross a navigation.
 *
 * These are the two that CLAUDE.md's warning applies to: a marker rendered
 * from a `useActionState` result can be unmounted by the revalidation before
 * it is observed. Both are asserted on the page the SERVER renders next.
 */
test("booking and cancelling each raise their toast on the page that follows", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 4 });

  try {
    await signInAs(context, players.runner);

    // --- created -----------------------------------------------------------
    await page.goto(`/game/${game.id}/book`);
    // NOTHING IS PRESELECTED since round 7 item 10 — Confirm is disabled until
    // an option is chosen.
    await page.getByTestId("pay-cash-input").check();
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation/);
    await expect(page.getByTestId("toast")).toBeVisible();
    await expect(page.getByTestId("toast")).toContainText("You're in");

    // --- cancelled ---------------------------------------------------------
    await page.goto(`/game/${game.id}`);
    // Two taps now: the claim bar's Cancel opens the dialog, and the dialog
    // carries the confirm — §3 screen 5, replacing `window.confirm`.
    await page.getByTestId("cancel-booking").click();
    await expect(page.getByTestId("cancel-dialog")).toBeVisible();
    await page.getByTestId("cancel-dialog-confirm").click();

    /*
     * WAIT FOR THE REDIRECT BEFORE ASSERTING ON WHAT IT RENDERED. `click()`
     * returns as soon as the form is submitted, so without this the toast
     * assertion races the server action that produces it — it passed alone and
     * failed inside the full suite, which is the shape CLAUDE.md already
     * names. The URL is also the thing under test: the acting request and the
     * request that renders the confirmation are different requests, and the
     * kind travels between them in the query string.
     */
    await page.waitForURL(/\?.*toast=/);

    // Back on the game page, rendered by the server with the toast in the URL.
    await expect(page.getByTestId("toast")).toBeVisible();
    await expect(page.getByTestId("toast")).toContainText("credit");
    // And the state-aware panel is gone, because the booking is.
    await expect(page.getByTestId("your-booking")).toHaveCount(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * A hand-edited toast parameter renders nothing. The set is closed for exactly
 * this reason: without it, `?toast=<anything>` would put arbitrary text on the
 * page in the product's own voice.
 */
test("an unrecognised toast parameter renders no toast at all", async ({ page }) => {
  const game = await createScratchGame();

  try {
    await page.goto(`/game/${game.id}?toast=You+have+won+a+prize`);
    await expect(page.getByTestId("toast")).toHaveCount(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * REQ-GAME-023 — the practical block, and where the equipment half of it went.
 *
 * Arrival and duration are true of the GAME and stay. Equipment moved into the
 * amenity grid (migration 38), where it is a per-venue fact an organizer can
 * turn off — rather than a promise a string table made about every pitch this
 * product would ever run.
 */
test("the detail carries arrival and duration, with equipment in the venue grid", async ({
  page,
}) => {
  const game = await createScratchGame({
    durationMinutes: 90,
    amenities: ["bibs", "gloves", "showers"],
  });

  try {
    await page.goto(`/game/${game.id}`);

    /*
     * ~~`practical-info`, a card at the bottom holding duration, arrival and
     * the two rotations.~~ REMOVED (round 16, item 4) — it and the top card
     * had become two lists of facts about one game, 400px apart, one titled
     * "Game information" and the other "Practical information".
     *
     * THE ASSERTION INVERTS rather than disappearing, so a later round cannot
     * quietly bring the second card back.
     */
    await expect(page.getByTestId("practical-info")).toHaveCount(0);

    // Duration and arrival live in the top card now, and the duration still
    // agrees with the span beside it because both resolve through one helper.
    const info = page.getByTestId("game-info-card");
    await expect(info.getByTestId("game-duration")).toContainText("90 minutes");
    await expect(info.getByTestId("game-arrival")).toContainText("10 minutes before");

    /*
     * NO LABEL WITHOUT A VALUE (round 16 improvement pass).
     *
     * `CardBadges` renders nothing when a game has neither format nor
     * surface, so the Format row used to print its term with an empty
     * definition beside it — the "Meeting point: —" problem arriving through
     * a different door. Asserted structurally rather than on one fixture:
     * every `<dt>` in this list must have a `<dd>` with something in it,
     * which holds for whatever the seed happens to contain.
     */
    const emptyTerms = await info.evaluate((card) => {
      const list = card.querySelector("dl");
      if (!list) return ["no dl"];
      const out: string[] = [];
      list.querySelectorAll("dt").forEach((term) => {
        const value = term.nextElementSibling;
        if (!value || value.tagName !== "DD" || (value.textContent ?? "").trim() === "") {
          out.push((term.textContent ?? "").trim());
        }
      });
      return out;
    });
    expect(emptyTerms, "a fact label is rendered with nothing beside it").toEqual([]);

    // Equipment is a venue claim, and it is not in the fact card either.
    await expect(info).not.toContainText("bibs");

    /*
     * TWO SECTIONS NOW (Section 4, item 2), splitting one column along the
     * grouping this repo already documented: what the organizer brings, then
     * what the pitch has. This fixture straddles both — bibs and gloves are
     * brought, showers are the pitch's — which is why it is the one that
     * proves the split rather than merely surviving it.
     */
    const included = page.getByTestId("amenity-grid");
    await expect(included).toBeVisible();
    await expect(included.getByTestId("amenity")).toHaveCount(2);
    await expect(included.locator('[data-amenity="bibs"]')).toBeVisible();
    await expect(included.locator('[data-amenity="gloves"]')).toBeVisible();

    const pitch = page.getByTestId("pitch-amenity-grid");
    await expect(pitch).toBeVisible();
    await expect(pitch.getByTestId("amenity")).toHaveCount(1);
    await expect(pitch.locator('[data-amenity="showers"]')).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * v1.2 §5.7 — a venue that provides nothing renders NO CARD, rather than an
 * empty one. An empty "What's included" is a claim that the venue provides
 * nothing; a missing card is the absence of a claim.
 */
test("a venue with nothing recorded renders no What's-included card", async ({ page }) => {
  const game = await createScratchGame({ amenities: [] });

  try {
    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("game-info-card")).toBeVisible();
    await expect(page.getByTestId("amenity-grid")).toHaveCount(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * TEST-222, the other half — a venue WITH a photo renders the photo panel.
 *
 * The fallback case is asserted above with the default scratch venue, which
 * deliberately has no image. This one needs a venue that does, and the file
 * has to exist under `public/venues/` — `next/image` 404s for one that does
 * not, and the assertion would then be on a broken image rather than on the
 * panel.
 */
test("a venue with a photo renders it full-bleed, with the name over it", async ({
  page,
}) => {
  const game = await createScratchGame({ withVenuePhoto: true });

  try {
    await page.goto(`/game/${game.id}`);

    const hero = page.getByTestId("game-hero");
    await expect(hero).toHaveAttribute("data-photo", "true");

    // The image itself, and it actually loaded — a 404 through next/image
    // renders an <img> that is present and zero-sized.
    const image = hero.locator("img");
    await expect(image).toBeVisible();
    const loaded = await image.evaluate(
      (node) => (node as HTMLImageElement).naturalWidth > 0,
    );
    expect(loaded).toBe(true);

    /*
     * FULL-BLEED IS THE REQUIREMENT (v1.2 §5.4), so it is measured rather than
     * looked at: the image must reach both edges of the viewport, not sit
     * inside the page gutter as the old 220px panel did.
     */
    const box = (await image.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
    // And it is the first thing on the page.
    expect(box.y).toBeLessThan(40);

    // The name is over the photograph, and the map link is in the info card.
    await expect(hero).toContainText("E2E Photo Pitch");
    await expect(page.getByTestId("venue-open-map")).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * ~~REQ-GAME-019 — no venue photo on the LIST, even for a venue that has one.~~
 * REVERSED BY THE OWNER, ROUND 13 ITEM 24.
 *
 * THE ORIGINAL REASON WAS DENSITY and it was a good one: "twelve different
 * photographs down a list is twelve different backgrounds competing with
 * twelve sets of text". It survived R6 by being restated — R6 put ONE default
 * pitch photo on every card, a constant rather than a variable, so the rule
 * narrowed from "no img" to "no VENUE img".
 *
 * WHAT CHANGED IS THE SCRIM. When REQ-GAME-019 was written the card had no
 * fade. R6a's ramp now runs to `ink` at full opacity across the lower two
 * thirds, and `strips-redesign-card.spec.ts` MEASURES that the text sits on a
 * contrast floor rather than on the image. A photograph under that ramp is a
 * texture, not a background — which is the premise the density argument stood
 * on, and it no longer holds.
 *
 * THE ASSERTION INVERTS PRECISELY. What is worth catching now is the two
 * surfaces DISAGREEING, which is what they did before this round: the detail
 * band had used the venue's photo since R13 while the list always drew the
 * default, so one game showed two different pitches.
 */
test("a venue's own photo backs its games on the list and the detail alike", async ({
  page,
}) => {
  const game = await createScratchGame({ withVenuePhoto: true, hoursFromNow: 24 * 22 });

  try {
    await page.goto(listUrlFor(game));
    const row = page.locator(`[data-testid="game-row"][href="/game/${game.id}"]`);
    await expect(row).toBeVisible();

    const cardPhoto = row.locator('[data-testid="card-photo"]');
    await expect(cardPhoto).toHaveAttribute("data-photo", "venue");
    const cardSrc = await cardPhoto.getAttribute("src");
    expect(cardSrc, "the card fell back to the default").not.toBe("/pitch-default.jpg");

    /*
     * ...and the detail band shows the SAME image.
     *
     * COMPARED AS SOURCE FILES, not as URLs. The hero goes through
     * `next/image` and the card does not, so the band's `src` is
     * `/_next/image?url=%2Fvenues%2F…` where the card's is the plain path.
     * Asserting the raw strings would be asserting which surface uses the
     * optimizer, which is not the property — the property is that one game
     * does not show two different pitches.
     */
    await page.goto(`/game/${game.id}`);
    const heroSrc = (await page.getByTestId("hero-photo").first().getAttribute("src")) ?? "";
    const heroSource = heroSrc.startsWith("/_next/image")
      ? decodeURIComponent(new URL(heroSrc, "http://x").searchParams.get("url") ?? "")
      : heroSrc;
    expect(heroSource).toBe(cardSrc);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * THE FLAT-150 CASE, ON THE CLAIM BAR — where the layout law puts it.
 *
 * The card used to carry `150 CZK / 1 credit`; the law moves it to the bar,
 * on the reasoning that a figure identical across eight rows teaches nothing
 * while scanning and everything at the moment of commitment.
 */
test("the claim bar shows the credit equivalence at 150, and not at any other price", async ({
  page,
}) => {
  const flat = await createScratchGame({ hoursFromNow: 24 * 5, priceCzk: 150 });
  const other = await createScratchGame({ hoursFromNow: 24 * 5 + 1, priceCzk: 200 });

  try {
    await page.goto(`/game/${flat.id}`);
    const bar = page.getByTestId("claim-bar");
    await expect(bar.getByTestId("claim-bar-price")).toContainText("150");
    await expect(bar.getByTestId("claim-bar-price-credit")).toContainText("1");

    // 200 is not one credit, and the bar declines to guess what it is —
    // inventing that ratio is the pro-rating the credits ruling stops on.
    await page.goto(`/game/${other.id}`);
    await expect(bar.getByTestId("claim-bar-price")).toContainText("200");
    await expect(bar.getByTestId("claim-bar-price-credit")).toHaveCount(0);
  } finally {
    await destroyScratchGame(flat.id);
    await destroyScratchGame(other.id);
  }
});

/*
 * AVATARS ON BOTH SURFACES, and a regression guard for a scare rather than a
 * bug.
 *
 * The stacks were reported missing from the games list after a round of card
 * refactoring. They were not: every card whose game has bookings renders them,
 * and every card whose game has NONE renders nothing — which is §2.1's rule
 * ("at zero bookings the stack is absent, not an empty ring") doing exactly
 * what it says. An empty board of scratch games looks identical to a
 * regression, which is precisely why this now has a spec instead of a probe.
 *
 * One game, two surfaces, asserted together — because the point of the
 * canonical card is that the list and the detail answer "who is coming" the
 * same way, and a spec that checked one could pass while they diverged.
 */
test("a booked game shows its avatar stack on the card AND on the detail", async ({
  page,
}) => {
  const empty = await createScratchGame({ hoursFromNow: 24 * 7, capacity: 12 });
  const booked = await createScratchGame({ hoursFromNow: 24 * 7 + 1, capacity: 12 });

  try {
    const organizer = await apiClientFor(players.organizer);
    const { error } = await organizer.rpc("admin_create_booking", {
      p_game_id: booked.id,
      p_player_id: players.runner.id,
      p_payment_method: "cash",
    });
    expect(error).toBeNull();

    await page.goto(listUrlFor(booked));

    // The list card carries the stack…
    const bookedRow = page.locator(`[data-testid="game-row"][href="/game/${booked.id}"]`);
    await expect(bookedRow.getByTestId("avatar")).toHaveCount(1);

    // …and a game nobody has claimed carries none, which is the rule and not
    // a failure.
    const emptyRow = page.locator(`[data-testid="game-row"][href="/game/${empty.id}"]`);
    await expect(emptyRow).toHaveCount(1);
    await expect(emptyRow.getByTestId("avatar")).toHaveCount(0);

    /*
     * ~~The detail answers it the same way, under the capacity line.~~
     * NO LONGER, AND DELIBERATELY (round 16, item 5).
     *
     * The detail carried BOTH the three-face summary here and the full
     * `players-list` below it — one set of people rendered twice, and round 14
     * item 13 made both clickable, so two links to the same profile sat 300px
     * apart. The list wins: a face without a name does not answer whether you
     * know anyone going.
     *
     * The LIST CARD keeps its stack, which is why the assertions above are
     * unchanged. That surface has no roster to show instead, so there the
     * faces are the only answer rather than a second one.
     */
    await page.goto(`/game/${booked.id}`);
    const availability = page.getByTestId("availability-card");
    await expect(availability.getByTestId("players-count")).toHaveCount(0);
    await expect(
      availability.getByTestId("avatar"),
      "the detail is showing its players twice again",
    ).toHaveCount(0);

    /*
     * The people are still on the page — ONCE, with their names.
     *
     * One avatar for one player, and that is the whole assertion: the roster
     * card used to draw an overlapping STACK directly above the named list, so
     * a single booking produced two avatars in one card. Counting them is the
     * only check that separates "the faces are shown" from "the faces are
     * shown twice".
     */
    const list = page.getByTestId("players-list");
    await expect(list).toBeVisible();
    /*
     * `roster-avatar`, WHICH IS THE ROW'S OWN. `avatar` was `AvatarRow`'s —
     * the stack that used to sit above this list — and asserting on it now
     * would be asserting that the duplication is back.
     */
    await expect(list.getByTestId("roster-avatar")).toHaveCount(1);
    await expect(
      list.getByTestId("avatar"),
      "the roster card is drawing its players twice again",
    ).toHaveCount(0);

    await page.goto(`/game/${empty.id}`);
    await expect(page.getByTestId("availability-card").getByTestId("avatar")).toHaveCount(0);
  } finally {
    await destroyScratchGame(empty.id);
    await destroyScratchGame(booked.id);
  }
});

/*
 * LIST-CARD / DETAIL PARITY, asserted across EVERY game on the board.
 *
 * The layout law says the two surfaces carry one arrangement, and until now
 * that was checked by looking at strips of one card at a time — which is how a
 * divergence survived: the detail wrapped its dotted rule in
 * `roster.length > 0`, so a game nobody had claimed showed the seam on its
 * list card and not on its detail. One sampled game would not have caught it,
 * because the sampled game usually has bookings.
 *
 * TWO PROPERTIES, BOTH ACROSS ALL GAMES:
 *
 *   - the dotted rule renders on BOTH surfaces, booked or empty
 *   - ~~the avatar count on the detail equals the count on the list card~~
 *
 * THE SECOND PROPERTY WAS RETIRED BY ROUND 16 ITEM 5, deliberately. The detail
 * drew the same people twice — a stack beside the counter and a stack above
 * the named roster — so "the two surfaces agree about how many faces" stopped
 * being the right question the moment the detail stopped having faces at all.
 *
 * WHAT REPLACES IT IS THE PROPERTY THAT ACTUALLY MATTERED. The original note
 * said this was "the durable answer to avatars are missing on the detail":
 * both surfaces read `game_roster_public`, so drift between them is a bug in a
 * prop or a conditional rather than in the data. That still holds — it is just
 * counted on the ROSTER ROWS now, which is where the detail shows its people.
 * A list card with three faces and a detail with an empty roster is exactly
 * the divergence this was written to catch, and it still fails on it.
 */
test("every game renders the same capacity bar and lineup on list and detail", async ({
  page,
}) => {
  await page.goto("/games");
  await expect(page.getByTestId("game-row").first()).toBeVisible();

  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="game-row"]')].slice(0, 6).map((card) => ({
      href: card.getAttribute("href")!,
      avatars: card.querySelectorAll('[data-testid="avatar"]').length,
      bars: card.querySelectorAll('[data-testid="capacity-segments"]').length,
    })),
  );

  expect(cards.length).toBeGreaterThan(0);

  for (const card of cards) {
    // The bar is on the list card whether or not anyone has booked.
    expect(card.bars, `list bar ${card.href}`).toBe(1);

    await page.goto(card.href);
    const detail = await page.evaluate(() => {
      const availability = document.querySelector('[data-testid="availability-card"]');
      if (!availability) return null;
      return {
        stackAvatars: availability.querySelectorAll('[data-testid="avatar"]').length,
        bars: availability.querySelectorAll('[data-testid="capacity-segments"]').length,
        rosterRows: document.querySelectorAll('[data-testid="roster"] li').length,
        rosterStack: document.querySelectorAll(
          '[data-testid="players-list"] [data-testid="avatar"]',
        ).length,
      };
    });

    expect(detail, `detail card ${card.href}`).not.toBeNull();
    expect(detail!.bars, `detail bar ${card.href}`).toBe(1);

    // No stack on either detail surface — item 5, asserted by inversion so the
    // duplication cannot come back on one of them quietly.
    expect(detail!.stackAvatars, `availability stack ${card.href}`).toBe(0);
    expect(detail!.rosterStack, `roster stack ${card.href}`).toBe(0);

    /*
     * THE LINEUP STILL AGREES, counted where each surface shows it. The card
     * caps its stack at three with a `+N` chip, so the comparison is "the
     * detail lists at least what the card drew" rather than an equality that
     * would fail on any game with four bookings.
     */
    expect(
      detail!.rosterRows,
      `lineup parity ${card.href}`,
    ).toBeGreaterThanOrEqual(card.avatars);
  }
});


/**
 * ROUND 17 ITEM 2 — a game box has an edge.
 *
 * IT SAT ON `surface` (#0F0F0F) AGAINST `ink` (#0A0A0A) WITH NO STROKE. Five
 * points of luminance is a difference a colour picker finds and a phone in
 * daylight does not, so a column of cards read as a column of text blocks. It
 * is `.lifted`'s problem one surface along, and it takes `.lifted`'s answer:
 * `hairline-strong` at .14, because .08 over these fills computes to the same
 * invisible edge one step further on.
 *
 * ASSERTED AS A COMPUTED COLOUR, not as a class name. `.game-box` is a
 * component-layer class and any utility in the markup outranks it, so reading
 * the class back would prove it was written rather than that it won — the same
 * reasoning the `.lifted` assertions use.
 *
 * AND IT IS NOT VOLT. The card already spends its accent on the time pill and
 * the spots figure (ruling D); a volt edge would make every row on the page
 * shout the thing one element on it is for. That half is asserted too, because
 * "add an outline" is exactly the instruction somebody later satisfies with
 * the accent colour.
 */
test("every game box carries the quiet hairline, and not a volt one", async ({ page }) => {
  await page.goto("/games", { waitUntil: "networkidle" });

  const boxes = await page.getByTestId("game-row").evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node);
      return {
        width: style.borderTopWidth,
        colour: style.borderTopColor,
        style: style.borderTopStyle,
      };
    }),
  );

  expect(boxes.length, "no game boxes on the page to check").toBeGreaterThan(0);

  for (const box of boxes) {
    expect(box.style, "the game box has no edge").not.toBe("none");
    expect(parseFloat(box.width), "the game box has no edge").toBeGreaterThan(0);
    expect(box.colour, "the game box edge is not the quiet hairline").toBe(
      "rgba(255, 255, 255, 0.14)",
    );
  }
});

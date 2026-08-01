import { expect, test } from "@playwright/test";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { anonClient, apiClientFor, players, serviceClient, signInAs } from "./helpers/session.ts";
import { pragueDayKey } from "../lib/games/days.ts";

/**
 * The list URL for the day a given game falls on.
 *
 * The games list filters by Prague calendar day (§5.5) and defaults to the
 * FIRST day that has games — so a spec asserting on a game two weeks out has
 * to ask for that game's day. Deriving the key from the stored kick-off rather
 * than from the offset the spec asked for keeps this correct across midnight
 * and across a DST boundary.
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
 * The list card carries the span too — REQ-GAME-007 names cards AND detail,
 * and a list that shows only the kick-off is the surface a player actually
 * plans their evening from.
 */
test("the games list shows a span, not only a kick-off", async ({ page }) => {
  const game = await createScratchGame({ durationMinutes: 90, hoursFromNow: 24 * 20 });

  try {
    await page.goto(listUrlFor(game));
    const row = page.locator(`[data-testid="game-row"][href="/game/${game.id}"]`);
    await expect(row).toHaveCount(1);
    // Two clock times with an en dash between them.
    await expect(row).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/);
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

    // And on the row, which is where a player decides whether to open it.
    // Both games are created with the same default offset, so one day tab
    // holds both — asserted rather than assumed by locating each in turn.
    await page.goto(listUrlFor(restricted));
    const restrictedRow = page.locator(
      `[data-testid="game-row"][href="/game/${restricted.id}"]`,
    );
    await expect(restrictedRow.getByTestId("skill-badge-advanced")).toBeVisible();

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
test("the organizer phone is visible only to a player holding a spot", async ({
  page,
  context,
}) => {
  const phone = "+420777654321";
  const game = await createScratchGame({
    organizerName: "Organizer On Call",
    organizerPhone: phone,
  });

  try {
    // --- anonymous ---------------------------------------------------------
    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("organizer-name")).toHaveText("Organizer On Call");
    await expect(page.getByTestId("organizer-phone")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(phone);

    // Not through the API either. `anon` is denied EXECUTE outright, which is
    // a stronger property than "the function returns null" — see migration 27.
    const anon = anonClient();
    const anonResult = await anon.rpc("game_organizer_phone", { p_game_id: game.id });
    expect(anonResult.data ?? null).toBeNull();

    // --- signed in, no booking on this game --------------------------------
    // A different seeded player, so "signed in" and "holds a spot here" are
    // genuinely separate conditions rather than the same one twice.
    const stranger = await apiClientFor(players.creditRich);
    const strangerResult = await stranger.rpc("game_organizer_phone", {
      p_game_id: game.id,
    });
    expect(strangerResult.data ?? null).toBeNull();

    await signInAs(context, players.creditRich);
    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("organizer-phone")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(phone);

    // --- holding a confirmed spot ------------------------------------------
    const runner = await apiClientFor(players.runner);
    const { error } = await runner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(error).toBeNull();

    await signInAs(context, players.runner);
    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("organizer-phone")).toHaveText(phone);
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
test("well more than three games are visible at phone width, without scrolling", async ({
  page,
}) => {
  // Six on the SAME Prague day, because the day picker filters the list — a
  // spec that spread them across days would be measuring the picker, not the
  // density.
  //
  // Pinned to mid-afternoon UTC on a day two weeks out: Prague is UTC+1 or
  // UTC+2 depending on the season, and both put these six firmly inside one
  // local day rather than near a boundary the run could straddle.
  const day = pragueDayKey(new Date(Date.now() + 14 * 24 * 3600_000));
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
    for (const row of await rows.all()) {
      const box = await row.boundingBox();
      if (box && box.y >= 0 && box.y + box.height <= viewport!.height) fullyVisible += 1;
    }

    // "Well more than three." Four would technically clear the old bar and
    // would not clear this one.
    expect(fullyVisible).toBeGreaterThanOrEqual(5);
  } finally {
    await Promise.all(games.map((game) => destroyScratchGame(game.id)));
  }
});

/*
 * REQ-GAME-021 — the day picker filters, and its counts describe the days.
 */
test("the day picker filters the list and counts each day", async ({ page }) => {
  // Two days apart, so the tabs are unambiguous whatever hour the suite runs.
  const dayOne = await createScratchGame({ hoursFromNow: 24 * 10 });
  const dayTwoA = await createScratchGame({ hoursFromNow: 24 * 12 });
  const dayTwoB = await createScratchGame({ hoursFromNow: 24 * 12 + 1 });

  try {
    await page.goto("/games");
    await expect(page.getByTestId("day-picker")).toBeVisible();

    // Selecting a day shows that day's games and hides the others.
    const secondDayRow = page.locator(
      `[data-testid="game-row"][href="/game/${dayTwoA.id}"]`,
    );
    const firstDayRow = page.locator(
      `[data-testid="game-row"][href="/game/${dayOne.id}"]`,
    );

    // Find the tab holding the two-game day by its count, rather than by
    // guessing a label — the weekday depends on when the suite runs.
    const tabs = page.getByTestId("day-tab");
    await expect(tabs.first()).toBeVisible();

    // Click through to the day carrying dayTwoA and assert the other day's
    // game is gone from the list.
    for (const tab of await tabs.all()) {
      await tab.click();
      await page.waitForLoadState("networkidle");
      if ((await secondDayRow.count()) > 0) break;
    }

    await expect(secondDayRow).toBeVisible();
    await expect(page.locator(`[data-testid="game-row"][href="/game/${dayTwoB.id}"]`)).toBeVisible();
    await expect(firstDayRow).toHaveCount(0);
  } finally {
    await destroyScratchGame(dayOne.id);
    await destroyScratchGame(dayTwoA.id);
    await destroyScratchGame(dayTwoB.id);
  }
});

/*
 * REQ-GAME-022 — one claim button in the product, and it is not on the list.
 */
test("rows say View game and never claim", async ({ page }) => {
  const game = await createScratchGame({ hoursFromNow: 24 * 16 });

  try {
    await page.goto(listUrlFor(game));
    const row = page.locator(`[data-testid="game-row"][href="/game/${game.id}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("View game");
    await expect(row).not.toContainText("Claim");

    // The row is a link to the detail, and the detail is where the claim is.
    await row.click();
    await page.waitForURL(`**/game/${game.id}`);
    await expect(page.getByTestId("book-cta")).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * REQ-GAME-020 — what each row actually carries.
 */
test("a row carries the span, venue, format, subs, price, badge and spots", async ({
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

    await expect(row.getByTestId("row-time-span")).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/);
    await expect(row).toContainText("E2E Scratch Pitch");
    await expect(row.getByTestId("game-format")).toHaveText("5v5");
    await expect(row.getByTestId("game-subs")).toContainText("2");
    await expect(row).toContainText("250 CZK");
    await expect(row.getByTestId("skill-badge-advanced")).toBeVisible();
    await expect(row.getByTestId("row-spots")).toContainText("12 spots left");
    // No venue photo on the list (§5.5) — the photo belongs to the detail.
    await expect(row.locator("img")).toHaveCount(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * REQ-GAME-013 — a venue with no photo renders the name and Open map, and no
 * empty frame.
 *
 * The scratch venue deliberately has no `image_path`, which is why it is the
 * fixture for this: the panel used to draw its vignette, pin and chips whether
 * or not a photo existed, so a venue without one got 220px of decoration that
 * looked like an image still loading.
 */
test("a venue with no photo renders name and Open map, with no empty frame", async ({
  page,
}) => {
  const game = await createScratchGame();

  try {
    await page.goto(`/game/${game.id}`);

    await expect(page.getByTestId("venue-panel-no-photo")).toBeVisible();
    await expect(page.getByTestId("venue-panel-photo")).toHaveCount(0);
    await expect(page.getByTestId("venue-open-map")).toBeVisible();
    await expect(page.getByTestId("venue-panel-no-photo")).toContainText("E2E Scratch Pitch");

    // The frame is what "no empty frame" is about: the panel must not be a
    // tall box. 96px is generous for one line of text and a button, and well
    // under the 220px the photo panel occupies.
    const box = await page.getByTestId("venue-panel-no-photo").boundingBox();
    expect(box!.height).toBeLessThan(96);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * REQ-GAME-014 / REQ-UX-002 — copy link is the primary share, and it toasts.
 *
 * Clipboard permission is granted explicitly: headless Chromium refuses
 * `navigator.clipboard.writeText` without it, and the component's fallback
 * would then be what is under test instead of the path a real phone takes.
 */
test("copy link puts the URL on the clipboard and raises a toast", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const game = await createScratchGame();

  try {
    await page.goto(`/game/${game.id}`);

    const copy = page.getByTestId("share-copy-link");
    await expect(copy).toBeVisible();
    // Primary means first: WhatsApp is beside it, not before it.
    const whatsapp = page.getByTestId("share-whatsapp");
    await expect(whatsapp).toBeVisible();

    await copy.click();

    await expect(page.getByTestId("toast")).toBeVisible();
    await expect(page.getByTestId("toast")).toContainText("Link copied");

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain(`/game/${game.id}`);
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
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation/);
    await expect(page.getByTestId("toast")).toBeVisible();
    await expect(page.getByTestId("toast")).toContainText("You're in");

    // --- cancelled ---------------------------------------------------------
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto(`/game/${game.id}`);
    await page.getByTestId("cancel-booking").click();

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
 * REQ-GAME-023 — the practical-info block, in one place rather than scattered.
 */
test("the detail carries arrival, equipment and duration in one block", async ({ page }) => {
  const game = await createScratchGame({ durationMinutes: 90 });

  try {
    await page.goto(`/game/${game.id}`);
    const block = page.getByTestId("practical-info");
    await expect(block).toBeVisible();
    await expect(block).toContainText("10 minutes before");
    await expect(block).toContainText("bibs");
    // The duration agrees with the span at the top of the page, because both
    // resolve through the same helper.
    await expect(block).toContainText("90 minutes");
  } finally {
    await destroyScratchGame(game.id);
  }
});

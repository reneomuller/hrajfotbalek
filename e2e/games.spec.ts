import { expect, test } from "@playwright/test";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";

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
    await page.goto("/games");
    const card = page.locator(`[data-testid="game-card"]:has(a[href="/game/${game.id}"])`);
    await expect(card).toHaveCount(1);
    // Two clock times with an en dash between them.
    await expect(card).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/);
  } finally {
    await destroyScratchGame(game.id);
  }
});

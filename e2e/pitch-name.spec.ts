import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, serviceClient, signInAs } from "./helpers/session.ts";

/**
 * THE PITCH NAME, TYPED PER GAME (migration 41).
 *
 * THE WHOLE FEATURE IS A LOOP and it is asserted as one: a name typed into the
 * game form is stored on the GAME, renders on the detail joined to the venue,
 * and comes back as a suggestion the next time the form is opened. Testing any
 * one of those alone would pass while the loop was broken — the suggestions
 * view is the part most likely to silently return nothing, and an empty
 * datalist looks exactly like a field with no dropdown.
 *
 * NO SAVE FLAG. Remembering is a consequence of saving the game, because
 * `pitch_name_suggestions` is a view over the names already stored. Migration
 * 41 left that choice open and the owner settled it this way.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("a typed pitch name is stored, rendered, and offered next time", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  await signInAs(context, players.organizer);

  const name = `Pitch ${Date.now() % 100000}`;
  const admin = serviceClient();
  let gameId: string | null = null;

  try {
    await page.goto("/admin/games/new", { waitUntil: "networkidle" });
    await page.getByTestId("venue-select").selectOption({ label: "E2E Scratch Pitch" });
    await page
      .getByTestId("starts-at")
      .fill(new Date(Date.now() + 96 * 3600_000).toISOString().slice(0, 16));
    await page.locator('input[name="capacity"]').fill("10");
    await page.locator('input[name="priceCzk"]').fill("150");

    // FREE TEXT, not a picker: this name has never existed before, so a
    // `<select>` could not have offered it and the first use of every new
    // pitch would be impossible.
    await page.getByTestId("pitch-name").fill(name);
    await page.getByTestId("game-form-submit").click();
    await page.waitForURL(/\/admin\/games\/[0-9a-f-]{36}$/);
    gameId = page.url().split("/").pop()!;

    // --- stored on the GAME, not on the venue ------------------------------
    // The distinction is the reason migration 41 added a column: writing it to
    // `venues` would rewrite the pitch of every other game at that ground,
    // including ones already played.
    const { data: game } = await admin
      .from("games")
      .select("pitch_name,venue_id")
      .eq("id", gameId)
      .single();
    expect(game?.pitch_name).toBe(name);

    const { data: venue } = await admin
      .from("venues")
      .select("pitch_name")
      .eq("id", game!.venue_id!)
      .single();
    expect(venue?.pitch_name, "the venue's own pitch name was overwritten").not.toBe(
      name,
    );

    // --- rendered on the detail, joined to the venue -----------------------
    await page.goto(`/game/${gameId}`, { waitUntil: "networkidle" });
    const title = await page.locator('[data-testid="game-hero"] h1').innerText();
    expect(title.toUpperCase()).toContain(name.toUpperCase());
    expect(title).toContain("·");

    // --- and it is a suggestion next time ----------------------------------
    await page.goto("/admin/games/new", { waitUntil: "networkidle" });
    const options = await page
      .locator("#pitch-name-options option")
      .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
    expect(options, "the typed name did not come back as a suggestion").toContain(name);
  } finally {
    if (gameId) await admin.from("games").delete().eq("id", gameId);
  }
});

/**
 * AN EMPTY BOX INHERITS THE VENUE'S PITCH — it does not store a blank.
 *
 * A stored "" would render through `venueDisplayName` as a stray separator on
 * every card for that game. The RPC trims to null and the parser does too;
 * this asserts the result rather than either mechanism.
 */
test("an empty pitch name inherits the venue's rather than storing a blank", async ({
  page,
  context,
}) => {
  await signInAs(context, players.organizer);
  const admin = serviceClient();
  let gameId: string | null = null;

  try {
    await page.goto("/admin/games/new", { waitUntil: "networkidle" });
    await page.getByTestId("venue-select").selectOption({ label: "E2E Scratch Pitch" });
    await page
      .getByTestId("starts-at")
      .fill(new Date(Date.now() + 97 * 3600_000).toISOString().slice(0, 16));
    await page.locator('input[name="capacity"]').fill("10");
    await page.locator('input[name="priceCzk"]').fill("150");
    // The pitch-name box is left untouched.
    await page.getByTestId("game-form-submit").click();
    await page.waitForURL(/\/admin\/games\/[0-9a-f-]{36}$/);
    gameId = page.url().split("/").pop()!;

    const { data } = await admin
      .from("games")
      .select("pitch_name")
      .eq("id", gameId)
      .single();
    expect(data?.pitch_name, "an empty box stored a blank instead of null").toBeNull();

    // And the detail shows the venue name with no dangling separator.
    await page.goto(`/game/${gameId}`, { waitUntil: "networkidle" });
    const title = await page.locator('[data-testid="game-hero"] h1').innerText();
    expect(title.trim().startsWith("·")).toBe(false);
    expect(title.trim().endsWith("·")).toBe(false);
  } finally {
    if (gameId) await admin.from("games").delete().eq("id", gameId);
  }
});

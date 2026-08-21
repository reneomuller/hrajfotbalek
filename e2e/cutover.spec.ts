import { expect, test } from "@playwright/test";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";

/**
 * G3 cutover specs — THE CODE HALF ONLY (§9, Phase 21).
 *
 * TEST-228 as written is a scenario about hrajsport.cz, and hrajsport.cz does
 * not resolve yet. It splits cleanly in two: the part that needs DNS (the host
 * redirects, the old origin's 301) is human-verified at the Phase 22 gate, and
 * the part that is pure routing is asserted here, on whatever origin the suite
 * is pointed at. Splitting it is the only way the namespace ships proven —
 * otherwise the first time `/football/games` is ever requested is in
 * production, on the day of the cutover, with the domain move as a co-suspect.
 */

/*
 * TEST-228a — `/football/*` resolves onto the existing routes.
 *
 * One assertion per route SHAPE rather than per route: the rewrite is two
 * rules, `/football` alone and `/football/:path*`, and the first is not a
 * special case of the second — a `:path*` match against the bare `/football`
 * yields an empty segment, which is exactly the kind of thing that works in
 * dev and 404s once built. Both are drawn.
 */
test("the football namespace serves the home page, the list and a game", async ({ page }) => {
  const game = await createScratchGame({});

  try {
    await page.goto("/football");
    await expect(page.getByRole("link", { name: /find a game/i }).first()).toBeVisible();

    await page.goto("/football/games");
    await expect(page.getByRole("heading", { name: /upcoming games/i })).toBeVisible();

    await page.goto(`/football/game/${game.id}`);
    await expect(page.getByText("E2E Scratch Pitch").first()).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * TEST-228b / REQ-CUT-006 — the wordmark inside `/football` still reads HRAJ
 * FOTBAL.
 *
 * §9 reserves the path namespace for a future sport, which is precisely why
 * this needs asserting: the change that eventually introduces `/volleyball`
 * will be tempted to make the header say whatever the namespace says. Football
 * keeps its own name inside the shared shell, and the temptation should fail a
 * test rather than reach a player.
 */
test("the wordmark inside the namespace is unchanged", async ({ page }) => {
  await page.goto("/football");

  /*
   * ~~const header = page.getByRole("banner")~~ — round 12 took the wordmark
   * TEXT out of the header and left the mark alone, and round 13 kept that.
   * ~~Round 12 moved this assertion to the hero.~~ Round 13 reversed the hero
   * too: it is the translated slogan again, so the brand name is written
   * nowhere on the page.
   *
   * THE PROPERTY IS UNCHANGED AND STILL WORTH ASSERTING: football keeps its
   * own identity inside the shared shell, and the change that introduces
   * `/volleyball` will be tempted to make the brand say whatever the
   * namespace says. What carries that identity now is the MARK, so that is
   * what is checked — and the mark is one file, which is the point.
   */
  await expect(page.getByTestId("brand-mark")).toBeVisible();
  await expect(page.getByTestId("brand-mark")).toHaveAttribute(
    "src",
    /hf-logo/,
  );
});

/*
 * TEST-228c / REQ-CUT-003 — the unprefixed paths are untouched.
 *
 * The rewrite is an ALIAS, not a move, and this is the assertion that says so.
 * Every link this product has ever shared — in a WhatsApp thread, in a booking
 * email, in the `.ics` sitting in someone's calendar — is unprefixed, and they
 * outnumber anything under `/football` by the entire history of the product.
 * A rewrite that quietly became a redirect would break all of them at once.
 */
test("the unprefixed paths still resolve, and are not redirected", async ({ page }) => {
  const game = await createScratchGame({});

  try {
    const response = await page.goto(`/game/${game.id}`);

    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(`/game/${game.id}`);
    await expect(page.getByText("E2E Scratch Pitch").first()).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * TEST-228d — the root redirect is INERT on this origin.
 *
 * The `/` → `/football` rule is keyed on a literal `hrajsport.cz`, so that it
 * can ship now and switch itself on when DNS arrives. That is only safe if it
 * demonstrably does nothing here — a rule that matched too broadly would send
 * every visitor to the live product's root into a namespace nobody has
 * announced, and it would do it on the deploy of this branch rather than at
 * the cutover. This spec is the difference between "inert by intent" and
 * "inert as far as anyone checked".
 */
test("the root of the current origin does not redirect", async ({ page }) => {
  await page.goto("/");

  expect(new URL(page.url()).pathname).toBe("/");
});

/*
 * TEST-228e / REQ-CUT-004 — the origin-derived surfaces derive from one place.
 *
 * The `.ics` is the surface where getting this wrong is least visible and
 * least recoverable: the file leaves the browser and lives in a calendar app
 * for weeks, and a URL that was wrong when it was written stays wrong. Rather
 * than asserting a hard-coded origin — which would only prove the test's
 * environment matches itself — this asserts the URL inside the file agrees
 * with the origin the request was served on. That is the property the cutover
 * actually needs: whatever `NEXT_PUBLIC_SITE_URL` becomes, the file follows.
 */
test("the calendar file carries the serving origin, not a baked-in one", async ({
  page,
  baseURL,
}) => {
  const game = await createScratchGame({});

  try {
    const response = await page.request.get(`/game/${game.id}/ics`);
    expect(response.status()).toBe(200);

    const body = await response.text();
    const expectedOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? baseURL!;

    expect(body).toContain(`${new URL(expectedOrigin).origin}/game/${game.id}`);
  } finally {
    await destroyScratchGame(game.id);
  }
});

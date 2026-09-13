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
/**
 * HOW LONG A COLD ROUTE MAY TAKE TO ARRIVE.
 *
 * The `/football` namespace is exercised in this file and nowhere else, so
 * every route here is always the first request the dev server has seen for it
 * and `goto` resolves on the document while Next is still compiling beneath.
 * Playwright's 5s default is measured against a warm route and this one never
 * is.
 */
const COLD_COMPILE_MS = 30_000;

test("the football namespace serves the home page, the list and a game", async ({ page }) => {
  const game = await createScratchGame({});

  try {
    /*
     * WHAT EACH OF THE THREE ASSERTIONS BELOW LOOKS FOR IS A REAL PART OF THE
     * PAGE, AND ONE OF THEM DID NOT USED TO BE.
     *
     * ~~`getByRole("heading", { name: /upcoming games/i })` on the list.~~ THE
     * GAMES PAGE HAS NO SUCH HEADING AND HAS NOT HAD ONE SINCE ROUND 23, which
     * removed it deliberately — "a heading repeating the tab name is the
     * largest type on the page spent on the one fact the reader cannot have
     * arrived without knowing". The only place that string still renders as an
     * `<h1>` is `GameCardSkeleton`, the SUSPENSE FALLBACK.
     *
     * So this assertion was passing on a LOADING SKELETON, and only while the
     * server was slow enough to show one. That is why it "flaked" late in a
     * long run and passed in isolation: warm, the real page arrives before the
     * fallback is ever painted, and the thing being asserted never exists.
     * Round 33 called it flake and re-ran. Two rounds of runs were spent on a
     * test that could not tell the product working from the product missing.
     *
     * `game-list` is the list itself, which is what "the namespace serves the
     * list" actually means.
     */
    await page.goto("/football");
    /*
     * ~~"Find a game", the hero's pill.~~ REMOVED in round 23 item 4, so the
     * landing page's own proof-of-life is the games section it now leads with
     * — which is a better one: the old assertion passed on a page whose games
     * had failed to load.
     */
    await expect(page.getByTestId("next-matches-all")).toBeVisible({ timeout: COLD_COMPILE_MS });

    await page.goto("/football/games");
    await expect(page.getByTestId("game-list")).toBeVisible({ timeout: COLD_COMPILE_MS });

    await page.goto(`/football/game/${game.id}`);
    await expect(page.getByText("E2E Scratch Pitch").first()).toBeVisible({
      timeout: COLD_COMPILE_MS,
    });
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
    await expect(page.getByText("E2E Scratch Pitch").first()).toBeVisible({
      timeout: COLD_COMPILE_MS,
    });
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

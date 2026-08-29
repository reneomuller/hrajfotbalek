import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, signInAs } from "./helpers/session.ts";

/**
 * ITEM 3 — the rebuilt profile, at 390px, EN.
 *
 * `docs/v13/strips/profile/`.
 *
 * GATED. These strips exist to sit beside the reference screen the owner
 * supplied, and nothing propagates from this shape until that comparison is
 * confirmed.
 *
 * A PLAYER WITH HISTORY, deliberately. `players.runner` has played games in
 * the seed tableau, so the stat row shows three real figures and the badge grid
 * shows both states. A strip of an empty profile would photograph three zeroes
 * and five locked tiles — which is a real state and is captured separately, but
 * is not evidence that the earned state renders at all. Three strips in this
 * round's predecessors were wrong in exactly this way.
 *
 * READ-ONLY. Every spec here navigates and captures; none of them writes, so
 * the seed tableau is the same afterwards.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/profile");

test.describe("item 3 — the rebuilt profile", () => {
  test.use({ viewport: { width: 390, height: 1400 } });

  test("identity, stats, tabs and badges — en", async ({ page, context }) => {
    mkdirSync(OUT, { recursive: true });
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await signInAs(context, players.runner);

    const settle = async () => {
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({
        content:
          "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
      });
    };

    await page.goto("/account", { waitUntil: "networkidle" });
    await settle();

    // --- the reference's anatomy, asserted before it is photographed --------
    // Cover + avatar + name + meta.
    await expect(page.getByTestId("profile-identity")).toBeVisible();
    await expect(page.getByTestId("account-avatar")).toBeVisible();
    await expect(page.getByTestId("account-nickname")).toBeVisible();
    // The meta line is country · since <month year>, and the "since" half is
    // always present because `players.created_at` is NOT NULL.
    await expect(page.getByTestId("profile-meta")).toContainText(/since \w+ \d{4}/i);

    /*
     * THE THREE-UP ROW, ALL THREE RENDERED. The THIRD one is now "players met"
     * where the database can count it and "pitches played" where it cannot
     * (round 23, item 1) — this suite's database has the migration applied, so
     * it is `met` here and would be `venues` on production until the owner
     * runs it. Asserted as "three tiles, whichever third", because the tile
     * that renders is a fact about the database and not about this page.
     */
    for (const key of ["games", "hours"]) {
      await expect(page.getByTestId(`profile-stat-${key}`)).toBeVisible();
    }
    await expect(
      page.locator('[data-testid="profile-stat-met"], [data-testid="profile-stat-venues"]'),
    ).toHaveCount(1);
    // A number, not a blank or a dash. `runner` has history, so games > 0.
    const gamesPlayed = await page
      .getByTestId("profile-stat-games-value")
      .textContent();
    expect(Number(gamesPlayed)).toBeGreaterThan(0);

    /*
     * ~~Three tabs~~ TWO, since round 16 item 14 folded Settings into
     * Overview. Ruling L's split — Overview is what you look at, Settings what
     * you change — was clean and cost a tap on the two things people come to
     * this page for. Asserted as an exact count rather than a minimum, so a
     * third tab reappearing fails here rather than being absorbed.
     */
    await expect(page.getByTestId("profile-tab")).toHaveCount(2);
    await expect(
      page.getByTestId("profile-tab").filter({ hasText: /overview/i }),
    ).toHaveAttribute("data-selected", "true");

    // Five badges, and BOTH STATES present — a grid where everything is locked
    // photographs identically to one where the earned styling is broken.
    const badges = page.getByTestId("badge");
    await expect(badges).toHaveCount(5);
    const earned = await page.locator('[data-testid="badge"][data-earned="true"]').count();
    const locked = await page.locator('[data-testid="badge"][data-earned="false"]').count();
    expect(earned, "no earned badge in the strip").toBeGreaterThan(0);
    expect(locked, "no locked badge in the strip").toBeGreaterThan(0);

    // Every badge shows its requirement, earned or not — that is the mechanic.
    for (const badge of await badges.all()) {
      await expect(badge).not.toBeEmpty();
    }

    // --- the strips ---------------------------------------------------------
    await page.addStyleTag({
      content:
        '[data-testid="nav-pill"],[data-testid="site-header"]{visibility:hidden !important}',
    });

    await page.screenshot({ path: path.join(OUT, "01-overview.png"), fullPage: true });
    await page.getByTestId("profile-identity").screenshot({
      path: path.join(OUT, "02-identity.png"),
    });
    await page.getByTestId("profile-stats").screenshot({
      path: path.join(OUT, "03-stats.png"),
    });
    await page.getByTestId("badge-grid").screenshot({
      path: path.join(OUT, "04-badges.png"),
    });

    // --- the other two tabs -------------------------------------------------
    await page.goto("/account?tab=games", { waitUntil: "networkidle" });
    await settle();
    await expect(
      page.getByTestId("profile-tab").filter({ hasText: /my games/i }),
    ).toHaveAttribute("data-selected", "true");
    await page.addStyleTag({
      content:
        '[data-testid="nav-pill"],[data-testid="site-header"]{visibility:hidden !important}',
    });
    await page.screenshot({ path: path.join(OUT, "05-tab-games.png"), fullPage: true });

    await page.goto("/account?tab=settings", { waitUntil: "networkidle" });
    await settle();
    await expect(page.getByTestId("profile-details")).toBeVisible();
    await expect(page.getByTestId("account-security")).toBeVisible();
    await page.addStyleTag({
      content:
        '[data-testid="nav-pill"],[data-testid="site-header"]{visibility:hidden !important}',
    });
    await page.screenshot({
      path: path.join(OUT, "06-tab-settings.png"),
      fullPage: true,
    });
  });

  /**
   * THE EMPTY PROFILE, which is the state a new arrival actually sees.
   *
   * It is the one the badge ladder is designed for — three zeroes and five
   * locked tiles, each carrying the requirement that unlocks it. Worth its own
   * strip precisely because it is the least interesting screen to build and the
   * most common one to be seen.
   *
   * `creditRich` IS THE FIXTURE WITH NO FOOTBALL BEHIND IT. The seed puts them
   * on the full game's WAITLIST and nowhere else, so they hold no booking on a
   * played or settled game — which is the definition every figure here counts
   * by. They also have a wallet, which is the useful part: it proves the three
   * zeroes are a fact about games played rather than about a new account.
   */
  test("a profile with no history at all — en", async ({ page, context }) => {
    mkdirSync(OUT, { recursive: true });
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await signInAs(context, players.creditRich);

    await page.goto("/account", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({
      content:
        "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
    });

    await expect(page.getByTestId("profile-stat-games-value")).toHaveText("0");
    await expect(
      page.locator('[data-testid="badge"][data-earned="true"]'),
    ).toHaveCount(0);

    await page.addStyleTag({
      content:
        '[data-testid="nav-pill"],[data-testid="site-header"]{visibility:hidden !important}',
    });
    await page.screenshot({ path: path.join(OUT, "07-empty.png"), fullPage: true });
  });
});

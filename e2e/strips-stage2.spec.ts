import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { apiClientFor, players, signInAs } from "./helpers/session.ts";
import { moveKickoff } from "./helpers/clock.ts";

/**
 * THE STAGE 2 CHECKPOINT STRIPS — the claim bar in every state it has.
 *
 * `docs/v13/strips/detail/`, committed, for the same reason as the Stage 0
 * strips: these are the artefact a verdict is given against.
 *
 * WHY THE BAR GETS A STRIP PER STATE. Ruling G's change is not visual, it is
 * that the bar is PRESENT AT ALL in five states where the product previously
 * rendered nothing — a holder, a waiting player, a full game, a started game
 * and a cancelled game each got a page whose bottom edge was empty. A single
 * strip of the open state would show the one state that already worked.
 *
 * VIEWPORT SHOTS, NOT FULL PAGE. The bar is `position: fixed`; a full-page
 * screenshot renders it once at its first-viewport position and stamps it
 * across the middle of the image, which is a capture artefact rather than a
 * product one (see `strips-stage0.spec.ts`).
 *
 * Each state is built from a disposable game and torn down. The seed tableau is
 * read, never mutated.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/detail");
const PHONE = { width: 390, height: 900 } as const;

test.describe("Stage 2 strips — the claim bar", () => {
  test.use({ viewport: PHONE });

  test("every claim-bar state at 390px", async ({ page, context }) => {
    mkdirSync(OUT, { recursive: true });

    async function strip(name: string, expectState: string) {
      // Fonts loaded, or the strip records fallback metrics and every line
      // length in it is a lie.
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({
        content:
          "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
      });
      await expect(page.getByTestId("claim-bar")).toHaveAttribute(
        "data-state",
        expectState,
      );
      // Scrolled to the bottom, which is where the bar is read from — and
      // where the page must still clear it.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    }

    // --- 1. open, signed out ------------------------------------------------
    const open = await createScratchGame({ hoursFromNow: 24 * 4, capacity: 12 });
    try {
      await page.goto(`/game/${open.id}`, { waitUntil: "networkidle" });
      await strip("01-open-signed-out", "open-signed-out");

      // --- 2. open, signed in ----------------------------------------------
      await signInAs(context, players.runner);
      await page.goto(`/game/${open.id}`, { waitUntil: "networkidle" });
      await strip("02-open-signed-in", "open-signed-in");

      // --- 3. holding, unpaid ----------------------------------------------
      // A cash booking is `reserved` until an admin confirms it, so it is the
      // cheapest way to reach the unpaid state honestly.
      const runner = await apiClientFor(players.runner);
      const { error } = await runner.rpc("create_booking", {
        p_game_id: open.id,
        p_payment_method: "cash",
      });
      expect(error).toBeNull();

      await page.goto(`/game/${open.id}`, { waitUntil: "networkidle" });
      await strip("03-holding-unpaid", "holding-unpaid");

      // --- 4. Czech, holding unpaid ----------------------------------------
      // Czech is a LAYOUT check, not a translation one: `K úhradě 200 CZK`
      // beside `Zrušit` is the longest this bar gets in any language.
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "cs", domain: "localhost", path: "/" },
      ]);
      await page.goto(`/game/${open.id}`, { waitUntil: "networkidle" });
      await strip("04-holding-unpaid-cs", "holding-unpaid");
      await context.addCookies([
        { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
      ]);
    } finally {
      await destroyScratchGame(open.id);
    }

    // --- 5. full, and 6. waiting -------------------------------------------
    const full = await createScratchGame({ hoursFromNow: 24 * 5, capacity: 2 });
    try {
      for (const player of [players.organizer, players.seedBot] as const) {
        const session = await apiClientFor(player);
        await session.rpc("create_booking", {
          p_game_id: full.id,
          p_payment_method: "cash",
        });
      }

      await signInAs(context, players.runner);
      await page.goto(`/game/${full.id}`, { waitUntil: "networkidle" });
      await strip("05-full", "full");

      const runner = await apiClientFor(players.runner);
      await runner.rpc("join_waitlist", { p_game_id: full.id });
      await page.goto(`/game/${full.id}`, { waitUntil: "networkidle" });
      await strip("06-waitlisted", "waitlisted");
    } finally {
      await destroyScratchGame(full.id);
    }

    // --- 7. started ---------------------------------------------------------
    const started = await createScratchGame({ hoursFromNow: 24 * 6, capacity: 12 });
    try {
      // Through the harness clock, which is the suite's existing way of doing
      // this — `service_role` has no UPDATE on `bookings` at all, and the
      // same discipline is kept for games so a strip never depends on a path
      // no player can reach.
      await moveKickoff(started.id, -2);
      await page.goto(`/game/${started.id}`, { waitUntil: "networkidle" });
      await strip("07-started", "started");
    } finally {
      await destroyScratchGame(started.id);
    }
  });
});

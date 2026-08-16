import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session.ts";
import { execAsOwner } from "./helpers/clock.ts";

/**
 * SECTION 4 STRIPS — the game card, full page, 390px, EN and CS.
 *
 * `docs/v13/strips/section4/`.
 *
 * THE GAME IS BUILT TO SHOW EVERY ITEM AT ONCE. Most of Section 4 is
 * conditional: the pitch-name prefix needs a venue that has one, the organizer
 * row's phone and WhatsApp appear ONLY for a viewer holding a spot, the two
 * amenity sections need amenities from both groups, and the players stack
 * needs somebody in the lineup. Sampling the seeded board would have caught
 * some of them and quietly missed the rest.
 *
 * The pitch name is written onto the scratch venue rather than a seeded one —
 * test-owned data, restored afterwards, so the seed tableau is read and never
 * mutated.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/section4");

test.describe("Section 4 strips — the game card", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test("full page with contact unlocked — en + cs", async ({ page, context }) => {
    mkdirSync(OUT, { recursive: true });

    const admin = serviceClient();
    const game = await createScratchGame({
      hoursFromNow: 24 * 3,
      capacity: 12,
      format: "6v6",
      surface: "turf",
      amenities: ["bibs", "gloves", "balls", "showers", "parking"],
      organizerName: "Jindra",
      organizerPhone: "+420777654321",
    });

    // The pitch name, on the scratch venue this game sits at.
    const { data: gameRow } = await admin
      .from("games")
      .select("venue_id")
      .eq("id", game.id)
      .single();
    /*
      THROUGH DIRECT POSTGRES, not PostgREST. `service_role` has SELECT and
      DELETE on `venues` but NO UPDATE — the same shape CLAUDE.md records for
      `bookings`, where the suite "tried to fake an elapsed grace window and
      got a silent permission error". A `.update()` here returns an error
      object nobody reads and the strip renders the unprefixed name, which is
      precisely how this was found.

      `execAsOwner` is the harness's owner connection, the same path
      `moveKickoff` uses for state no RPC exposes.
    */
    await execAsOwner("update public.venues set pitch_name = $2 where id = $1", [
      gameRow!.venue_id!,
      "Sportovní centrum",
    ]);

    try {
      // A booking, so the organizer's contact is unlocked and the lineup has
      // faces — both are viewer-dependent, and this is the viewer.
      const runner = await apiClientFor(players.runner);
      await runner.rpc("create_booking", {
        p_game_id: game.id,
        p_payment_method: "cash",
      });
      await signInAs(context, players.runner);

      for (const locale of ["en", "cs"] as const) {
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
        ]);

        await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);

        // The rulings, asserted in the strip that claims them.
        await expect(page.getByTestId("organizer-phone")).toBeVisible();
        await expect(page.getByTestId("organizer-whatsapp")).toHaveAttribute(
          "href",
          /wa\.me\/420777654321/,
        );
        await expect(page.getByTestId("amenity-grid")).toBeVisible();
        await expect(page.getByTestId("pitch-amenity-grid")).toBeVisible();
        await expect(page.locator("h1")).toContainText("Sportovní centrum ·");

        await page.addStyleTag({
          content:
            "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
        });
        await page.addStyleTag({
          content: '[data-testid="site-header"]{visibility:hidden !important}',
        });
        await page.screenshot({
          path: path.join(OUT, `game-card-390-${locale}.png`),
          fullPage: true,
        });
      }
    } finally {
      // Leave the shared scratch venue as it was found.
      await execAsOwner("update public.venues set pitch_name = null where id = $1", [
        gameRow!.venue_id!,
      ]);
      await destroyScratchGame(game.id);
    }
  });
});

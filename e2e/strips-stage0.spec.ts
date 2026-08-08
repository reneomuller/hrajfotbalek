import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, signInAs } from "./helpers/session";

/**
 * THE STAGE 0 CHECKPOINT STRIPS.
 *
 * Every screen the product has, at 390px, in English and Czech, written to
 * `docs/v13/strips/` rather than to the gitignored `screenshots/` — these are
 * the artefact a verdict is given against, so they are committed.
 *
 * WHAT THEY ARE FOR, and what a reviewer should expect to SEE. Stage 0
 * redesigns no screen, and changes the appearance of all of them. The
 * differences are the token table, and they are the point:
 *
 *   lighter surfaces        #0A0A0A -> #0F0F0F, and every translucent card
 *                           is now opaque
 *   stronger selected       hairline-volt .18 -> .30
 *   lighter tertiary text   faint #6F6F6F -> #7E7E7E, an AA repair
 *   softer controls         rounded-control 8px -> 14px, on every button,
 *                           input and day box — the most visible single change
 *   rounder cards           rounded-card 16px -> 18px
 *   heavier hairlines       hairline-strong .12 -> .14
 *   no card strokes         ruling C, 27 of them removed
 *   one family              Barlow Condensed is gone from player-facing UI;
 *                           mono survives on four banking strings
 *   sentence case           ruling B — eyebrow is the only uppercase style
 *   a focus ring            new; the product had none meeting WCAG 1.4.11
 *
 * The last four are the ones most likely to read as "someone redesigned this",
 * and none of them is a redesign.
 *
 * CZECH IS NOT A TRANSLATION CHECK. It is a LAYOUT check: Czech is the longest
 * of the three languages and is where a label overflows first. `Permanentka`
 * in the nav pill is the specific thing measured in
 * docs/v13/nav-label-check.md.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips");

/** 390px is the iPhone 12/13/14 mini and the narrowest width worth designing for. */
const PHONE = { width: 390, height: 900 } as const;

interface Screen {
  id: string;
  path: string;
  /** Signed-in screens need a session; the rest are captured signed out. */
  auth?: boolean;
  /** Something to wait for, so a strip is never captured mid-render. */
  settle?: string;
}

const SCREENS: Screen[] = [
  { id: "01-home", path: "/" },
  { id: "02-games-list", path: "/games", settle: '[data-testid="game-row"]' },
  { id: "03-login", path: "/login" },
  { id: "04-signup", path: "/signup" },
  { id: "05-terms", path: "/terms" },
  { id: "06-privacy", path: "/privacy" },
  { id: "07-not-found", path: "/this-route-does-not-exist" },
  { id: "08-pass", path: "/pass" },
  { id: "09-account", path: "/account", auth: true },
  { id: "10-my-games", path: "/my-games", auth: true },
];

test.describe("Stage 0 strips", () => {
  test.use({ viewport: PHONE });

  for (const locale of ["en", "cs"] as const) {
    test(`every screen at 390px — ${locale}`, async ({ page, context }) => {
      mkdirSync(path.join(OUT, locale), { recursive: true });

      // The locale is a cookie, read server-side on the next render.
      // `hf_locale`, from lib/i18n/locales.ts — not "locale". Getting the name
      // wrong is silent: the app falls back to English and the Czech strip is
      // an English strip with a Czech filename, which is worse than no strip
      // because it looks like evidence.
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
      ]);

      await signInAs(context, players.runner);

      for (const screen of SCREENS) {
        await page.goto(screen.path, { waitUntil: "networkidle" });

        if (screen.settle) {
          // Best effort: a screen with no rows is still a screen worth
          // capturing, and its empty state is one of the things Stage 0 has to
          // get right.
          await page
            .locator(screen.settle)
            .first()
            .waitFor({ timeout: 4000 })
            .catch(() => {});
        }

        // Fonts must be loaded, or the strip records the fallback metrics and
        // every line length in it is a lie.
        await page.evaluate(() => document.fonts.ready);

        /*
         * Hide the Next.js dev-mode indicator.
         *
         * The harness starts `npm run dev`, and Next paints a small circular
         * badge at the bottom-left of every page. It is not part of the
         * product, it sits exactly where the nav pill's first tab is, and on a
         * review strip it reads as a stray UI element nobody can find in the
         * code — which is precisely the kind of thing a verdict round wastes
         * time on.
         */
        await page.addStyleTag({
          content:
            "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
        });

        /*
         * ONE VIEWPORT SHOT, WITH THE CHROME, then a full-page shot without it.
         *
         * A `fullPage` screenshot renders a `position: fixed` element once, at
         * the place it occupied in the FIRST viewport — so on a tall page the
         * nav pill ends up stamped across the middle of the image, on top of
         * whatever card happens to be there. That is an artefact of the
         * capture, not of the product, and a reviewer should not have to know
         * that to read the strip.
         *
         * So the chrome gets its own shot at viewport height, where it is
         * exactly where it really is, and the full-page shot hides the fixed
         * layers so the content is unobstructed.
         */
        await page.screenshot({
          path: path.join(OUT, locale, `${screen.id}-chrome.png`),
        });

        await page.addStyleTag({
          content:
            '[data-testid="nav-pill"],[data-testid="site-header"]{visibility:hidden !important}',
        });

        await page.screenshot({
          path: path.join(OUT, locale, `${screen.id}.png`),
          fullPage: true,
        });
      }

      // The capture is the assertion: if any navigation threw, the test fails
      // before reaching here.
      expect(SCREENS.length).toBeGreaterThan(0);
    });
  }
});

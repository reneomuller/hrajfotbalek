import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE, LOCALES } from "../lib/i18n/locales";
import { apiClientFor, players, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * ROUND 34, ITEM 2 — THE LAW, ASSERTED AGAINST WHAT ACTUALLY RENDERS.
 *
 * `lib/i18n/__tests__/vocabulary.test.ts` walks the string TABLES and is the
 * stronger of the two: it sees every key, including the ones only one error
 * path renders. It cannot see a word HARDCODED INTO A COMPONENT, and that is
 * the whole reason this file exists — the rule the owner set is about what a
 * player can read, not about where the text was stored.
 *
 * FOUR LANGUAGES, BECAUSE THE INTERNAL WORD HAS FOUR SPELLINGS. A crawl in
 * English alone would pass on a page that says "z peněženky" in Czech, which is
 * exactly the shape the add-guests panel had before this round.
 *
 * ADMIN IS EXEMPT AND IS NOT CRAWLED. `balanceLabel` is still "Wallet" there on
 * purpose: the organizer is reconciling money and the ledger's own noun is the
 * clearest word available to them.
 */

test.use({ viewport: { width: 390, height: 844 } });

const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: "wallet", pattern: /\bwallets?\b/i },
  { label: "peněženka", pattern: /pen[ěe]žen/i },
  { label: "кошелёк", pattern: /кошель|кошелёк|кошелек/i },
  { label: "гаманець", pattern: /гаман/i },
];

/**
 * The pages a player can reach where money is named.
 *
 * CHOSEN RATHER THAN CRAWLED, and each one earns its place: these are the
 * surfaces whose copy was rewritten this round plus the two that spend and
 * return credits. A blind crawl would add minutes and visit the admin panel.
 */
function playerPages(gameId: string): [string, string][] {
  return [
    ["the game page", `/game/${gameId}`],
    ["the booking page", `/game/${gameId}/book`],
    ["the account page", "/account"],
    ["my games", "/my-games"],
    ["the pass page", "/pass"],
    ["the FAQ", "/faq"],
    ["the games list", "/games"],
    ["the home page", "/"],
  ];
}

for (const locale of LOCALES) {
  test(`no player-facing surface says the internal word in ${locale}`, async ({
    page,
    context,
  }) => {
    const game = await createScratchGame({ capacity: 12, hoursFromNow: 24 * 16 });
    try {
      await signInAs(context, players.creditRich);
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
      ]);

      const offences: string[] = [];

      for (const [surface, url] of playerPages(game.id)) {
        await page.goto(url, { waitUntil: "networkidle" });

        /*
         * THE RENDERED TEXT, NOT THE HTML. A class name, a build hash and a
         * URL all live in the markup and none of them is something a player
         * reads; matching those would make this fail for reasons that have
         * nothing to do with the vocabulary.
         */
        const shown = await page.locator("body").innerText();

        for (const { label, pattern } of FORBIDDEN) {
          for (const line of shown.split("\n")) {
            if (pattern.test(line)) {
              offences.push(`${surface} (${locale}) says "${label}": ${line.trim()}`);
            }
          }
        }
      }

      expect(offences, offences.join("\n")).toEqual([]);
    } finally {
      await destroyScratchGame(game.id);
    }
  });
}

test("a credit amount never renders as crowns on a player surface", async ({
  page,
  context,
}) => {
  /*
   * ROUND 35'S EXTENSION, CRAWLED. The table walk in
   * `lib/i18n/__tests__/vocabulary.test.ts` sees every key; this sees what a
   * component actually composed — a number formatted by `formatCzk` next to a
   * credit label is invisible to the table, because neither half of it is a
   * string in the table.
   *
   * THE SURFACES ARE THE ONES THAT SPEAK CREDITS, and the assertion is per
   * LINE: a rendered line that mentions credit must not also carry a crowns
   * figure. A card price on its own line — "180 CZK", "4 spots · 720 CZK" — is
   * the product working and is not caught, which is the distinction the ruling
   * draws.
   */
  const game = await createScratchGame({ capacity: 12, priceCzk: 180, hoursFromNow: 24 * 10 });
  try {
    await signInAs(context, players.creditRich);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    const CREDIT = /credit/i;
    const CROWNS = /\d[\d\s\u00a0]*(CZK|Kč)/i;
    /*
     * AN EQUIVALENCE IS NOT A CONVERSION, and this is the distinction the rule
     * turns on. The claim bar renders "180 CZK / 1 credit": a card price in
     * crowns beside the credit price in credits, each in its own unit, which is
     * the product TELLING the player the rate rather than making them apply it.
     * `games.spec.ts` asserts that line deliberately.
     *
     * What the law forbids is a credit AMOUNT wearing crowns — a balance, a
     * cost, a remainder. A line that carries a crowns figure AND a credit
     * COUNT is showing both units and cannot be that.
     */
    const CREDIT_COUNT = /\d+\s*credit/i;
    const offences: string[] = [];

    for (const [surface, url] of [
      ["the account page", "/account"],
      ["the booking page", `/game/${game.id}/book`],
      ["the game page", `/game/${game.id}`],
      ["the pass page", "/pass"],
    ] as const) {
      await page.goto(url, { waitUntil: "networkidle" });
      for (const line of (await page.locator("body").innerText()).split("\n")) {
        if (CREDIT.test(line) && CROWNS.test(line) && !CREDIT_COUNT.test(line)) {
          offences.push(`${surface}: ${line.trim()}`);
        }
      }
    }

    expect(offences, offences.join("\n")).toEqual([]);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("the add-guests panel and the booking page use the SAME word for credits", async ({
  page,
  context,
}) => {
  /*
   * ONE TERM, ASSERTED AS SAMENESS RATHER THAN AS A PARTICULAR STRING. The
   * owner's rule is that booking and add-guests say the same thing; pinning
   * both to a literal would pass on the day somebody changes one of them to a
   * different literal and updates the test to match. They now render the SAME
   * KEY — `booking.payWithCredit` — and this is what would notice if a second
   * key came back.
   */
  const game = await createScratchGame({ capacity: 12, priceCzk: 150, hoursFromNow: 24 * 15 });
  try {
    await signInAs(context, players.creditRich);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "cs", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
    const atBooking = (await page.getByTestId("pay-credit").innerText()).split("\n")[0]!.trim();

    /*
     * `cash`, NOT `credit`. The method is DERIVED — `create_booking` refuses
     * `credit` as an input with "payment_method must be qr or cash; credit and
     * seed_free are derived" — and this player's balance covers the game, so
     * the RPC settles it from credit and returns a confirmed booking, which is
     * the state the add-guests panel needs.
     */
    const client = await apiClientFor(players.creditRich);
    const booked = await client.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(booked.error, `create_booking: ${booked.error?.message}`).toBeNull();

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    const atAddGuests = (await page.getByTestId("add-guests-credit").innerText()).trim();

    expect(atAddGuests, "the two surfaces name the credit rail differently").toBe(atBooking);
  } finally {
    await destroyScratchGame(game.id);
  }
});

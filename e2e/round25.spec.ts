import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { strings } from "../lib/strings";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import {
  createScratchGame,
  destroyScratchGame,
  setWalletTo,
} from "./helpers/scaffold";

/**
 * ROUND 25 — the abandoned checkout, the FAQ, and the community panel.
 *
 * `docs/v25/strips/`.
 */

const OUT = path.resolve(process.cwd(), "docs/v25/strips");

test.use({ viewport: { width: 390, height: 844 } });

async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });
}

/* ============================================================================
 * ITEM 1 — ~~an unpaid seat is never a named participant~~
 *
 * SUPERSEDED BY ROUND 26's PAY-FIRST ARCHITECTURE, and the tests moved rather
 * than being deleted: `e2e/round26.spec.ts` asserts the stronger property that
 * replaced them. Round 25 made an unpaid seat anonymous; round 26 removed the
 * unpaid seat. The one assertion that still belongs to this round — that a
 * PAID booking is still named, i.e. the anonymity fix was not too wide — moved
 * with them, because under pay-first it is the only kind of booking there is.
 * ========================================================================== */

/* ============================================================================
 * ITEM 2 — embedded checkout, gated
 * ========================================================================== */

test("the online option stays live and the flow never dead-ends", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    await signInAs(context, players.runner);
    await setWalletTo(players.runner.id, 0);
    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });

    /*
     * EITHER RAIL COUNTS. This environment has the LINK variable set and no
     * Stripe keys, which is production's state today — so the option must be
     * offered and must lead somewhere. When the owner sets the two keys the
     * same assertion holds through the embedded page instead, which is the
     * point of gating on "is there anywhere to pay" rather than on a rail.
     */
    const online = page.getByTestId("pay-online-input");
    await expect(online).toBeEnabled();
    await online.check();
    await page.getByTestId("confirm-booking").click();

    // It went SOMEWHERE — a payment page or our own checkout — and not back
    // to the form with an error.
    await page.waitForURL(/\/payment\/(return|checkout)/);
    expect(page.url()).not.toContain("/book");
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("the checkout page refuses a game it cannot sell", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    /*
     * ~~Somebody else's BOOKING id in the URL.~~ Under pay-first there is no
     * booking to borrow (round 26, item 1) — the URL carries a GAME and a
     * party size, both public. So the thing worth asserting changed with the
     * architecture: the page must refuse to open a form for a game that cannot
     * be sold, which is checked before a Stripe session is created.
     */
    await signInAs(context, players.creditRich);
    await serviceClient().rpc("cancel_game", { p_game_id: game.id });

    await page.goto(`/payment/checkout?game=${game.id}&guests=0`);

    expect(
      page.url(),
      "a checkout opened for a cancelled game",
    ).not.toContain("/payment/checkout");
  } finally {
    await destroyScratchGame(game.id);
  }
});

/* ============================================================================
 * ITEMS 3 and 4 — the FAQ texts and the community panel
 * ========================================================================== */

test("the FAQ renders the owner's four questions and answers, in order", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  await page.goto("/", { waitUntil: "networkidle" });
  await settle(page);

  /*
   * READ OFF THE RENDERED PANEL, which the item asks for and which is the only
   * way to catch the failure that matters: a string table edited correctly and
   * a panel still rendering something else. `textContent` rather than
   * `innerText`, because the answers live in collapsed `<details>` and
   * `innerText` returns only what is open.
   */
  const rendered = await page.getByTestId("faq-panel").evaluate((el) => {
    /*
     * THE MARKER IS NOT THE QUESTION. Each `<summary>` draws its own `+` / `−`
     * affordance inside two spans, so `textContent` returns "+−What should I
     * bring?". The question is the summary's own TEXT NODES — the spans are
     * furniture, and reaching for one of them by position would break the
     * moment somebody adds a third.
     */
    const questions = [...el.querySelectorAll("summary")].map((q) =>
      [...q.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim(),
    );
    const answers = [...el.querySelectorAll("details p")].map((a) =>
      (a.textContent ?? "").trim(),
    );
    return { questions, answers };
  });

  expect(rendered.questions).toEqual(strings.faq.items.map((item) => item.q));
  expect(rendered.answers).toEqual(strings.faq.items.map((item) => item.a));

  // And the exact opening words the owner supplied, so a later "improvement"
  // to the table is caught here rather than shipped.
  expect(rendered.questions[0]).toBe("What should I bring?");
  expect(rendered.answers[2]).toContain("card or mobile wallet");
  expect(rendered.answers[3]).toBe(
    "Not at all. All skill levels are welcome. Games are casual unless a level badge says otherwise.",
  );

  await page.getByTestId("faq-panel").screenshot({ path: path.join(OUT, "02-faq.png") });
});

test("the community panel wears the Game Pass banner's treatment", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  await page.goto("/", { waitUntil: "networkidle" });
  await settle(page);

  const panel = page.getByTestId("community-panel");
  const style = await panel.evaluate((el) => {
    const s = getComputedStyle(el);
    return { border: s.borderTopColor, background: s.backgroundColor, width: s.borderTopWidth };
  });

  /*
   * VOLT ON A VOLT WASH, which is the Game Pass banner's own treatment rather
   * than an approximation of it — `border-hairline-volt` and `bg-volt/[.10]`
   * are the banner's literal classes. Asserted as "the accent is present"
   * rather than as an exact rgba string, because the token's alpha is a
   * design decision that may move and the CLAIM is that this panel and that
   * banner are drawn the same way.
   */
  expect(style.border, `border ${style.border}`).toMatch(/200,\s*255,\s*0/);
  expect(style.background, `background ${style.background}`).toMatch(/200,\s*255,\s*0/);
  expect(parseFloat(style.width)).toBeGreaterThan(0);

  // …and the same treatment the pass banner has, read off the pass banner.
  await page.goto("/games", { waitUntil: "networkidle" });
  const banner = await page.getByTestId("pass-panel").evaluate((el) => {
    const s = getComputedStyle(el);
    return { border: s.borderTopColor, background: s.backgroundColor };
  });
  expect(style.border).toBe(banner.border);
  expect(style.background).toBe(banner.background);

  // THE LOGOS, 25% LARGER: 44px was the old size, so 55 is the new one.
  await page.goto("/", { waitUntil: "networkidle" });
  const sizes = await panel.evaluate((el) =>
    [...el.querySelectorAll("img")].map((img) => Math.round(img.getBoundingClientRect().width)),
  );
  expect(sizes, `logo widths ${sizes.join(", ")}`).toHaveLength(3);
  for (const size of sizes) expect(size).toBe(55);

  await panel.screenshot({ path: path.join(OUT, "03-community.png") });
});

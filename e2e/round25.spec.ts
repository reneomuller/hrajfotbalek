import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { strings } from "../lib/strings";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import {
  createScratchGame,
  destroyScratchGame,
  expireOnlinePayment,
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

/**
 * A booking that went to a payment page and was abandoned.
 *
 * THROUGH THE REAL PATH: `create_booking` with `p_online` is what stamps
 * `payment_pending_at`, and it is the stamp — not the row — that this whole
 * item is about. Building the row by hand would test a state the product
 * cannot produce.
 */
async function abandonedCheckout(game: { id: string }, who = players.runner) {
  await setWalletTo(who.id, 0);
  const client = await apiClientFor(who);
  const { data, error } = await client.rpc("create_booking", {
    p_game_id: game.id,
    p_payment_method: "qr",
    p_guest_count: 0,
    p_online: true,
  });
  expect(error, `create_booking(online): ${error?.message}`).toBeNull();
  const booking = data as unknown as { id: string; status: string };
  expect(booking.status, "an online booking should start reserved").toBe("reserved");
  return booking;
}

/* ============================================================================
 * ITEM 1 — an unpaid seat is never a named participant
 * ========================================================================== */

test("an abandoned checkout holds a seat and names nobody", async ({ page, context }) => {
  mkdirSync(OUT, { recursive: true });
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    const booking = await abandonedCheckout(game);
    const admin = serviceClient();

    // THE SEAT IS HELD, which is the design and stays. A race must not sell
    // the same spot twice while somebody is typing a card number.
    const { data: seats } = await admin.rpc("game_seats_taken", { p_game_id: game.id });
    expect(seats, "the checkout stopped holding its seat").toBe(1);

    /*
     * AND NOBODY IS NAMED. This is the defect: the roster used
     * `booking_holds_seat` to decide whose NAME to publish, so for thirty
     * minutes an abandoner's nickname and photograph sat on a public page,
     * indistinguishable from somebody who had paid.
     */
    const { data: roster } = await admin
      .from("game_roster_public")
      .select("nickname, is_pending")
      .eq("game_id", game.id);
    const rows = (roster ?? []) as { nickname: string | null; is_pending: boolean }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.nickname, "the abandoner is named on the public roster").toBeNull();
    expect(rows[0]!.is_pending).toBe(true);

    // AS A SIGNED-OUT VISITOR SEES IT — the page, not the view.
    await context.clearCookies();
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await settle(page);

    const players_ = page.getByTestId("players-list");
    await expect(players_).toContainText(strings.games.seatAwaitingPayment);
    await expect(
      players_,
      "the abandoner's nickname is on the game page",
    ).not.toContainText(players.runner.nickname);
    await expect(page.getByTestId("roster-player-link")).toHaveCount(0);
    /*
     * AND NO GAMES-PLAYED CHIP. The view returns 0 for a pending row, which
     * rendered "First game" beside the anonymous seat — a wrong fact about a
     * real player, on the row that exists to say nothing about them.
     */
    await expect(page.getByTestId("player-games-played")).toHaveCount(0);

    await players_.screenshot({ path: path.join(OUT, "01-pending-seat.png") });

    /*
     * THE OWNER'S OWN VIEW STILL SAYS WHAT IS HAPPENING, which is the other
     * half of the standard: anonymous to everyone else, explicit to them.
     */
    await signInAs(context, players.runner);
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await settle(page);
    await expect(page.getByTestId("awaiting-payment")).toBeVisible();

    void booking;
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("past thirty minutes the seat frees itself and the sweep expires the row", async () => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    const booking = await abandonedCheckout(game);
    const admin = serviceClient();

    /*
     * THE CLOCK, MOVED ON THE ROW RATHER THAN ON THE MACHINE — through the
     * OWNER CONNECTION, which is the whole reason `expireOnlinePayment`
     * exists. `service_role` has no UPDATE on `bookings`, so a PostgREST
     * `.update()` here reports success and changes nothing; the first version
     * of this test did exactly that and failed on the assertion after it,
     * which is the documented trap working as designed.
     */
    await expireOnlinePayment(booking.id);

    // The SEAT goes immediately: `booking_holds_seat` is time-based.
    const { data: seats } = await admin.rpc("game_seats_taken", { p_game_id: game.id });
    expect(seats, "an abandoned checkout still holds its seat past the window").toBe(0);

    const { data: roster } = await admin
      .from("game_roster_public")
      .select("nickname")
      .eq("game_id", game.id);
    expect(roster ?? [], "an abandoned checkout still has a roster row").toHaveLength(0);

    /*
     * THE ROW IS THE HALF NOBODY HAD LOOKED FOR. It stayed `reserved` forever
     * — production carried one for thirteen days — and `settle_game` refuses
     * while any reserved booking remains, so its game could never be settled.
     */
    const { data: before } = await admin
      .from("bookings")
      .select("status")
      .eq("id", booking.id)
      .single();
    expect((before as { status: string }).status).toBe("reserved");

    const { data: swept, error } = await admin.rpc("expire_pending_online_payments");
    expect(error, `expire_pending_online_payments: ${error?.message}`).toBeNull();
    expect(swept as number).toBeGreaterThanOrEqual(1);

    const { data: after } = await admin
      .from("bookings")
      .select("status")
      .eq("id", booking.id)
      .single();
    expect(
      (after as { status: string }).status,
      "the abandoned booking survived the sweep",
    ).toBe("expired");
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a paid booking is still named — the fix is scoped to pending checkouts", async () => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    // Credit covers it, so `create_booking` confirms on the spot.
    await setWalletTo(players.creditRich.id, 150);
    const client = await apiClientFor(players.creditRich);
    await client.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });

    const { data: roster } = await serviceClient()
      .from("game_roster_public")
      .select("nickname, is_pending")
      .eq("game_id", game.id);
    const rows = (roster ?? []) as { nickname: string | null; is_pending: boolean }[];

    expect(rows).toHaveLength(1);
    expect(
      rows[0]!.nickname,
      "a confirmed player lost their name — the fix is too wide",
    ).toBe(players.creditRich.nickname);
    expect(rows[0]!.is_pending).toBe(false);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a party's guest seats go anonymous with the checkout that holds them", async () => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    await setWalletTo(players.runner.id, 0);
    const client = await apiClientFor(players.runner);
    const { error } = await client.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "qr",
      p_guest_count: 2,
      p_online: true,
    });
    expect(error).toBeNull();

    const { data: roster } = await serviceClient()
      .from("game_roster_public")
      .select("nickname, guest_of, is_pending")
      .eq("game_id", game.id);
    const rows = (roster ?? []) as {
      nickname: string | null;
      guest_of: string | null;
      is_pending: boolean;
    }[];

    // Three seats — the player and two guests — and not one of them names
    // anybody. A guest row carrying `guest_of` would leak the owner.
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.nickname).toBeNull();
      expect(row.guest_of, "a guest row still names the player who brought it").toBeNull();
    }
  } finally {
    await destroyScratchGame(game.id);
  }
});

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

test("the checkout page refuses a booking that is not yours", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    const booking = await abandonedCheckout(game, players.runner);

    // Somebody else's id in the URL.
    await signInAs(context, players.creditRich);
    const response = await page.goto(`/payment/checkout?booking=${booking.id}`);

    /*
     * 404 OR A REDIRECT AWAY — never the form. Without the keys this page
     * redirects to /games before it reads anything, which is also correct;
     * what must never happen is a Stripe session created for a stranger's
     * booking.
     */
    expect(page.url(), "somebody else's checkout rendered").not.toContain(
      "/payment/checkout",
    );
    void response;
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

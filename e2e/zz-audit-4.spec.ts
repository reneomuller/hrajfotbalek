import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, serviceClient, signInAs, signOut } from "./helpers/session";
import { createScratchGame, destroyScratchGame, clearActiveBookings, resetWallet } from "./helpers/scaffold";

/** WCAG relative luminance + contrast ratio, from decoded pixels. */
function lum(r: number, g: number, b: number) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Brightest and darkest luminance inside an element's rendered pixels. */
function extremes(buf: Buffer) {
  const png = PNG.sync.read(buf);
  let lo = 1, hi = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const l = lum(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!);
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  return { lo, hi, ratio: (hi + 0.05) / (lo + 0.05) };
}

test("audit contrast + states", async ({ page, context }) => {
  test.setTimeout(20 * 60 * 1000);
  const out: Record<string, unknown> = {};
  await page.setViewportSize({ width: 390, height: 844 });
  const admin = serviceClient();
  const { data: pub } = await admin.from("games").select("id").eq("status","published").not("format","is",null).limit(1).single();
  const gid = pub!.id;

  // ---- contrast of text over photographic surfaces -----------------------
  await signOut(context);
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);

  const contrast: Record<string, unknown> = {};
  await page.goto("/games", { waitUntil: "networkidle" });
  for (const id of ["card-venue", "card-when", "row-spots", "game-format"]) {
    const el = page.getByTestId(id).first();
    if ((await el.count()) === 0) continue;
    await el.scrollIntoViewIfNeeded();
    contrast["card:" + id] = extremes(await el.screenshot());
  }
  await page.goto(`/game/${gid}`, { waitUntil: "networkidle" });
  for (const id of ["game-hero"]) {
    const el = page.getByTestId(id).first();
    if ((await el.count()) === 0) continue;
    contrast["detail:" + id] = extremes(await el.screenshot());
  }
  await signInAs(context, players.creditRich);
  await page.goto("/account", { waitUntil: "networkidle" });
  for (const id of ["profile-cover", "account-avatar"]) {
    const el = page.getByTestId(id).first();
    if ((await el.count()) === 0) continue;
    contrast["profile:" + id] = extremes(await el.screenshot());
  }
  out.contrast = contrast;

  // ---- empty-state inventory ---------------------------------------------
  const empties: Record<string, unknown> = {};

  // Player with no games at all
  await clearActiveBookings("creditPartial");
  await signInAs(context, players.creditPartial);
  for (const [name, url] of [
    ["account-games-empty", "/account?tab=games"],
    ["my-games-empty", "/my-games"],
  ] as [string, string][]) {
    await page.goto(url, { waitUntil: "networkidle" });
    empties[name] = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const text = (main.textContent || "").trim();
      return {
        hasCta: main.querySelector("a[href='/games'], [data-testid$='-cta']") !== null,
        chars: text.length,
        excerpt: text.slice(0, 160),
      };
    });
  }

  // A day with no games — the filtered empty state
  await page.goto("/games?day=2027-01-01", { waitUntil: "networkidle" });
  empties["games-day-empty"] = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    return {
      hasEmptyTestid: main.querySelector('[data-testid="game-list-empty"], [data-testid="empty-state"]') !== null,
      text: (main.textContent || "").trim().slice(0, 220),
    };
  });

  // Notifications with nothing in them
  await page.goto("/games", { waitUntil: "networkidle" });
  await page.locator("header button").first().click();
  await page.waitForTimeout(400);
  empties["bell"] = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="notification-panel"]');
    return panel ? { text: (panel.textContent||"").trim().slice(0,140) } : { missing: true };
  });

  // A venue with no amenities / no photo, and a game with no roster
  const bare = await createScratchGame({ capacity: 6, hoursFromNow: 90 });
  await page.goto(`/game/${bare.id}`, { waitUntil: "networkidle" });
  empties["detail-bare"] = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    return {
      lineupEmpty: main.querySelector('[data-testid="lineup-empty"]') !== null,
      amenityGrid: main.querySelector('[data-testid="amenity-grid"]') !== null,
      notes: main.querySelector('[data-testid="game-notes"]') !== null,
      organizer: main.querySelector('[data-testid="game-organizer"]') !== null,
    };
  });
  await destroyScratchGame(bare.id);
  await resetWallet(players.creditPartial.id);
  out.empties = empties;

  // ---- error states -------------------------------------------------------
  const errors: Record<string, unknown> = {};
  for (const [name, url] of [
    ["game-404", "/game/00000000-0000-4000-8000-000000000000"],
    ["player-404", "/player/nobody-here"],
    ["route-404", "/nope"],
  ] as [string, string][]) {
    const res = await page.goto(url, { waitUntil: "domcontentloaded" });
    errors[name] = {
      status: res?.status() ?? null,
      text: (await page.locator("body").innerText()).trim().slice(0, 150),
    };
  }
  out.errors = errors;

  writeFileSync("/tmp/audit/pass4.json", JSON.stringify(out, null, 1));
  console.log("PASS4 " + JSON.stringify(out, null, 1).slice(0, 3000));
});

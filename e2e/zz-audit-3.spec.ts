import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, serviceClient, signInAs } from "./helpers/session";

test("audit pass 3", async ({ page, context }) => {
  test.setTimeout(10 * 60 * 1000);
  await page.setViewportSize({ width: 390, height: 844 });
  const out: Record<string, unknown> = {};

  await signInAs(context, players.organizer);
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
  await page.goto("/admin/games", { waitUntil: "networkidle" });

  out.adminNav = await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="admin-nav-games"]')!.parentElement!;
    const s = getComputedStyle(nav);
    const last = document.querySelector('[data-testid="admin-nav-site"]')!.getBoundingClientRect();
    // Can it be scrolled to?
    const before = nav.scrollLeft;
    nav.scrollLeft = 9999;
    const after = nav.scrollLeft;
    nav.scrollLeft = before;
    return {
      overflowX: s.overflowX,
      scrollWidth: nav.scrollWidth,
      clientWidth: nav.clientWidth,
      scrollable: after > 0,
      lastChipRight: Math.round(last.right),
      viewport: document.documentElement.clientWidth,
      tag: nav.tagName,
      cls: nav.className.slice(0, 120),
    };
  });

  // Is the last chip reachable by pointer after scrolling?
  out.adminNavReach = await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="admin-nav-games"]')!.parentElement!;
    nav.scrollLeft = 9999;
    const el = document.querySelector('[data-testid="admin-nav-site"]')!;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { right: Math.round(r.right), reachable: el.contains(hit) || el === hit };
  });

  // Russian duration label
  const admin = serviceClient();
  const { data: pub } = await admin.from("games").select("id").eq("status","published").limit(1).single();
  await context.addCookies([{ name: LOCALE_COOKIE, value: "ru", domain: "localhost", path: "/" }]);
  await page.goto(`/game/${pub!.id}`, { waitUntil: "networkidle" });
  out.ruDuration = await page.evaluate(() => {
    const dts = [...document.querySelectorAll('[data-testid="game-info-card"] dt')];
    return dts.map((el) => {
      const s = getComputedStyle(el);
      return {
        text: (el.textContent||"").trim(),
        clientW: el.clientWidth, scrollW: el.scrollWidth,
        overflow: s.overflow, wrap: s.overflowWrap, ws: s.whiteSpace,
        clipped: el.scrollWidth > el.clientWidth + 1,
        h: Math.round(el.getBoundingClientRect().height),
      };
    });
  });
  await page.screenshot({ path: "/tmp/audit/ru-detail.png", clip: { x: 0, y: 200, width: 390, height: 380 } });

  // Day picker: scrollable by design?
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
  await page.goto("/games", { waitUntil: "networkidle" });
  out.dayPicker = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="day-picker"]')!;
    return { overflowX: getComputedStyle(el).overflowX, sw: el.scrollWidth, cw: el.clientWidth };
  });

  writeFileSync("/tmp/audit/pass3.json", JSON.stringify(out, null, 1));
  console.log("PASS3 " + JSON.stringify(out, null, 1).slice(0, 2000));
});

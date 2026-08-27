import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, serviceClient, signInAs, signOut } from "./helpers/session";

const PROBE = `(() => {
  const out = { headings: [], overflow: [], sections: [], primary: [], surfaces: [] };
  const px = (v) => Math.round(parseFloat(v) * 100) / 100;

  document.querySelectorAll("h1,h2,h3,h4").forEach((el) => {
    const s = getComputedStyle(el);
    out.headings.push({
      tag: el.tagName, size: px(s.fontSize), weight: s.fontWeight,
      transform: s.textTransform, color: s.color, family: s.fontFamily.split(",")[0],
      tracking: s.letterSpacing, text: (el.textContent||"").trim().slice(0,28),
    });
  });

  // Anything clipped or spilling
  document.querySelectorAll("body *").forEach((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    const clipped = el.scrollWidth > el.clientWidth + 1 && s.overflowX !== "auto" && s.overflowX !== "scroll";
    const spills = r.right > document.documentElement.clientWidth + 1;
    if (clipped || spills) {
      out.overflow.push({
        testid: el.getAttribute("data-testid") || el.tagName.toLowerCase(),
        text: (el.textContent||"").trim().slice(0,34),
        clipped, spills,
        over: Math.round(Math.max(el.scrollWidth - el.clientWidth, r.right - document.documentElement.clientWidth)),
        ellipsis: s.textOverflow === "ellipsis",
      });
    }
  });

  // Primary-looking controls: volt background
  document.querySelectorAll("a,button").forEach((el) => {
    const s = getComputedStyle(el);
    if (s.backgroundColor === "rgb(200, 255, 0)") {
      const r = el.getBoundingClientRect();
      out.primary.push({
        testid: el.getAttribute("data-testid") || null,
        text: (el.textContent||"").trim().slice(0,24),
        h: px(r.height), radius: s.borderTopLeftRadius,
        size: px(s.fontSize), weight: s.fontWeight, transform: s.textTransform,
      });
    }
  });

  // Card-like surfaces
  document.querySelectorAll("section,div,li,a").forEach((el) => {
    const s = getComputedStyle(el);
    const rad = parseFloat(s.borderTopLeftRadius);
    if (rad >= 14 && rad < 900) {
      out.surfaces.push({
        testid: el.getAttribute("data-testid") || null,
        radius: rad, bg: s.backgroundColor,
        border: parseFloat(s.borderTopWidth) > 0 ? s.borderTopWidth + " " + s.borderTopColor : "none",
        pad: s.padding,
      });
    }
  });
  return out;
})()`;

test("audit pass 2", async ({ page, context }) => {
  test.setTimeout(20 * 60 * 1000);
  mkdirSync("/tmp/audit", { recursive: true });
  const admin = serviceClient();
  const { data: pub } = await admin.from("games").select("id").eq("status","published").not("format","is",null).limit(1).single();
  const gid = pub!.id;

  const targets: [string, string, string][] = [
    ["home", "/", "out"], ["games", "/games", "out"], ["detail", `/game/${gid}`, "out"],
    ["book", `/game/${gid}/book`, "credit"], ["pass", "/pass", "runner"],
    ["account", "/account", "credit"], ["login", "/login", "out"], ["signup", "/signup", "out"],
    ["admin-dash", "/admin", "organizer"], ["admin-game", `/admin/games/${gid}`, "organizer"],
    ["admin-players", "/admin/players", "organizer"], ["admin-venues", "/admin/venues", "organizer"],
    ["admin-stats", "/admin/stats", "organizer"], ["player", `/player/${players.runner.nickname}`, "runner"],
  ];

  const res: Record<string, unknown> = {};
  let cur = "";
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, url, as] of targets) {
    if (as !== cur) {
      await context.clearCookies();
      if (as === "runner") await signInAs(context, players.runner);
      else if (as === "credit") await signInAs(context, players.creditRich);
      else if (as === "organizer") await signInAs(context, players.organizer);
      else await signOut(context);
      cur = as;
    }
    for (const loc of ["en", "cs", "ru"]) {
      await context.addCookies([{ name: LOCALE_COOKIE, value: loc, domain: "localhost", path: "/" }]);
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(100);
        res[`${name}-${loc}`] = await page.evaluate(PROBE);
      } catch (e) { res[`${name}-${loc}`] = { error: String(e).slice(0,120) }; }
    }
  }
  writeFileSync("/tmp/audit/pass2.json", JSON.stringify(res, null, 1));
  console.log("PASS2 " + Object.keys(res).length);
});

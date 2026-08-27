import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { apiClientFor, players, serviceClient, signInAs, signOut } from "./helpers/session";

/**
 * ROUND 20 — the audit's measurement harness. Not a test: it walks the product
 * and dumps numbers. Deleted before the branch is handed over.
 */

const OUT_JSON = "/tmp/audit";
const OUT_SHOTS = path.resolve(process.cwd(), "docs/audit-2026-08/screens");

const PROBE = `(() => {
  const seen = [];
  const nodes = document.querySelectorAll("body *");
  const type = {};
  const radius = {};
  const borders = {};
  const gaps = {};
  const taps = [];
  const colors = {};

  for (const el of nodes) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (s.visibility === "hidden" || s.display === "none") continue;

    // Type: only elements with their own text
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own) {
      const key = s.fontSize + "/" + s.fontWeight + "/" + s.lineHeight;
      type[key] = (type[key] || 0) + 1;
      colors[s.color] = (colors[s.color] || 0) + 1;
    }

    const rad = parseFloat(s.borderTopLeftRadius);
    if (rad > 0) radius[s.borderTopLeftRadius] = (radius[s.borderTopLeftRadius] || 0) + 1;

    const bw = parseFloat(s.borderTopWidth);
    if (bw > 0 && s.borderTopStyle !== "none") {
      const k = s.borderTopWidth + " " + s.borderTopColor;
      borders[k] = (borders[k] || 0) + 1;
    }

    for (const p of ["marginTop", "gap", "paddingTop", "paddingLeft"]) {
      const v = parseFloat(s[p]);
      if (v > 0) gaps[p + ":" + Math.round(v)] = (gaps[p + ":" + Math.round(v)] || 0) + 1;
    }

    const tag = el.tagName.toLowerCase();
    const interactive =
      tag === "a" || tag === "button" || tag === "input" || tag === "select" ||
      tag === "textarea" || el.getAttribute("role") === "button";
    if (interactive) {
      taps.push({
        tag,
        testid: el.getAttribute("data-testid") || null,
        text: (el.textContent || "").trim().slice(0, 30),
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        type: el.getAttribute("type"),
      });
    }
  }
  return { type, radius, borders, gaps, taps, colors, height: document.body.scrollHeight };
})()`;

interface Target {
  name: string;
  url: string;
  as?: "out" | "runner" | "credit" | "organizer" | "partial";
  locales?: string[];
}

test("audit measure", async ({ page, context }) => {
  test.setTimeout(30 * 60 * 1000);
  mkdirSync(OUT_SHOTS, { recursive: true });
  mkdirSync(OUT_JSON, { recursive: true });

  const admin = serviceClient();
  const { data: pub } = await admin
    .from("games").select("id").eq("status", "published").not("format", "is", null).limit(1).single();
  const { data: full } = await admin.from("games").select("id").eq("status", "full").limit(1);
  const { data: past } = await admin.from("games").select("id").eq("status", "played").limit(1);
  const { data: cancelled } = await admin.from("games").select("id").eq("status", "cancelled").limit(1);

  const gid = pub!.id;
  const targets: Target[] = [
    { name: "home-out", url: "/", as: "out", locales: ["en", "cs", "ru"] },
    { name: "home-player", url: "/", as: "runner" },
    { name: "games-out", url: "/games", as: "out", locales: ["en", "cs", "ru"] },
    { name: "games-player", url: "/games", as: "runner" },
    { name: "detail-out", url: `/game/${gid}`, as: "out", locales: ["en", "cs", "ru"] },
    { name: "detail-player", url: `/game/${gid}`, as: "runner" },
    { name: "detail-full", url: `/game/${full?.[0]?.id ?? gid}`, as: "runner" },
    { name: "detail-past", url: `/game/${past?.[0]?.id ?? gid}`, as: "runner" },
    { name: "detail-cancelled", url: `/game/${cancelled?.[0]?.id ?? gid}`, as: "runner" },
    { name: "book", url: `/game/${gid}/book`, as: "credit" },
    { name: "book-nocredit", url: `/game/${gid}/book`, as: "runner" },
    { name: "pass", url: "/pass", as: "runner", locales: ["en", "cs", "ru"] },
    { name: "account-credit", url: "/account", as: "credit" },
    { name: "account-empty", url: "/account", as: "partial" },
    { name: "account-games", url: "/account?tab=games", as: "credit" },
    { name: "my-games", url: "/my-games", as: "runner" },
    { name: "login", url: "/login", as: "out", locales: ["en", "cs", "ru"] },
    { name: "signup", url: "/signup", as: "out" },
    { name: "reset", url: "/login/reset", as: "out" },
    { name: "player-public", url: `/player/${players.runner.nickname}`, as: "runner" },
    { name: "privacy", url: "/privacy", as: "out" },
    { name: "terms", url: "/terms", as: "out" },
    { name: "notfound", url: "/no-such-page", as: "out" },
    { name: "admin-dash", url: "/admin", as: "organizer" },
    { name: "admin-games", url: "/admin/games", as: "organizer" },
    { name: "admin-game", url: `/admin/games/${gid}`, as: "organizer" },
    { name: "admin-new", url: "/admin/games/new", as: "organizer" },
    { name: "admin-players", url: "/admin/players", as: "organizer" },
    { name: "admin-venues", url: "/admin/venues", as: "organizer" },
    { name: "admin-stats", url: "/admin/stats", as: "organizer" },
    { name: "admin-site", url: "/admin/site", as: "organizer" },
    { name: "credits-added", url: "/pass/credits-added", as: "credit" },
    { name: "payment-return", url: "/payment/return", as: "runner" },
  ];

  const results: Record<string, unknown> = {};
  let currentAs = "";

  for (const vp of [{ w: 390, h: 844, tag: "390" }, { w: 1280, h: 900, tag: "1280" }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });

    for (const t of targets) {
      const as = t.as ?? "out";
      if (as !== currentAs) {
        await context.clearCookies();
        if (as === "runner") await signInAs(context, players.runner);
        else if (as === "credit") await signInAs(context, players.creditRich);
        else if (as === "partial") await signInAs(context, players.creditPartial);
        else if (as === "organizer") await signInAs(context, players.organizer);
        else await signOut(context);
        currentAs = as;
      }

      const locales = vp.tag === "390" ? (t.locales ?? ["en"]) : ["en"];
      for (const loc of locales) {
        await context.addCookies([
          { name: LOCALE_COOKIE, value: loc, domain: "localhost", path: "/" },
        ]);
        const key = `${t.name}-${loc}-${vp.tag}`;
        try {
          await page.goto(t.url, { waitUntil: "networkidle", timeout: 20000 });
          await page.evaluate(() => document.fonts.ready);
          await page.addStyleTag({
            content: "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none!important}",
          });
          await page.waitForTimeout(120);
          results[key] = await page.evaluate(PROBE);
          await page.screenshot({
            path: path.join(OUT_SHOTS, `${key}.png`),
            fullPage: vp.tag === "390",
          });
        } catch (e) {
          results[key] = { error: String(e).slice(0, 160) };
        }
      }
    }
  }

  writeFileSync(path.join(OUT_JSON, "measures.json"), JSON.stringify(results, null, 1));
  console.log("AUDIT KEYS " + Object.keys(results).length);
});

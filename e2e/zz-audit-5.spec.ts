import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { signOut } from "./helpers/session";

test("audit pass 5", async ({ page, context }) => {
  test.setTimeout(10 * 60 * 1000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signOut(context);
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
  const out: Record<string, unknown> = {};

  await page.goto("/games", { waitUntil: "networkidle" });

  // Find an EMPTY day chip (data-empty="true") and tap it.
  const empty = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="day-tab"]')]
      .filter((e) => e.getAttribute("data-empty") === "true")
      .map((e) => ({ day: e.getAttribute("data-day"), href: e.getAttribute("href") }))[0] ?? null,
  );
  out.emptyChip = empty;

  if (empty) {
    await page.goto(empty.href!, { waitUntil: "networkidle" });
    out.afterTappingEmptyDay = await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid="game-row"]').length;
      const sel = document.querySelector('[data-testid="day-tab"][data-selected="true"]');
      return {
        url: location.pathname + location.search,
        gameRows: rows,
        anyDaySelected: sel?.getAttribute("data-day") ?? null,
        allChipSelected:
          document.querySelector('[data-testid="day-tab-all"]')?.getAttribute("data-selected") ?? null,
        emptyStateShown: document.querySelector('[data-testid="empty-state"]') !== null,
        headings: [...document.querySelectorAll('[data-testid="day-heading"]')].map((h) => h.textContent?.trim()),
      };
    });
    await page.screenshot({ path: "/tmp/audit/empty-day.png", clip: { x: 0, y: 0, width: 390, height: 420 } });
  }

  writeFileSync("/tmp/audit/pass5.json", JSON.stringify(out, null, 1));
  console.log("PASS5 " + JSON.stringify(out, null, 1));
});

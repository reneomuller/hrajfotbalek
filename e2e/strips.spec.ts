import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { apiClientFor, players, signInAs } from "./helpers/session.ts";

/**
 * Screenshot strips — the review surface for the UX loop (contract §8).
 *
 * NOT ASSERTIONS. These produce artefacts for a human to look at in a batch,
 * at phone width, and return verdicts on. They assert only that the page
 * rendered at all, because a strip whose failure mode is "the test went red" is
 * a strip nobody ever sees.
 *
 * Written to `screenshots/g1/`, which is gitignored: they are a snapshot of a
 * moment, not a baseline to diff against. Visual-regression baselines are a
 * different tool with different upkeep, and committing PNGs to compare would
 * make every copy change a binary diff.
 *
 * Run with:  npx playwright test e2e/strips.spec.ts
 */

const OUT = path.resolve(process.cwd(), "screenshots", "g1");

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

async function strip(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

test("signed-out surfaces", async ({ page }) => {
  for (const [name, url] of [
    ["01-landing", "/"],
    ["02-games", "/games"],
    ["03-login", "/login"],
    ["04-signup", "/signup"],
    ["05-terms", "/terms"],
  ] as const) {
    await page.goto(url, { waitUntil: "networkidle" });
    await strip(page, name);
  }
});

test("account surfaces", async ({ page, context }) => {
  await signInAs(context, players.runner);

  for (const [name, url] of [
    ["06-account", "/account"],
    ["07-topup", "/account/topup"],
    ["08-set-password", "/login/set-password?next=%2Faccount"],
  ] as const) {
    await page.goto(url, { waitUntil: "networkidle" });
    await strip(page, name);
  }
});

test("the top-up QR, which is the one screen a player uses at a bank app", async ({
  page,
  context,
}) => {
  const runner = await apiClientFor(players.runner);
  const { data: topup } = await runner.rpc("create_topup", { p_amount_czk: 300 });

  await signInAs(context, players.runner);
  await page.goto(`/account/topup/${topup.id}`);
  await expect(page.getByTestId("qr-payment")).toBeVisible();
  await strip(page, "09-topup-qr");
});

test("admin surfaces", async ({ page, context }) => {
  await signInAs(context, players.organizer);

  for (const [name, url] of [
    ["10-admin-games", "/admin/games"],
    ["11-admin-topups", "/admin/topups"],
    ["12-admin-players", "/admin/players"],
  ] as const) {
    await page.goto(url, { waitUntil: "networkidle" });
    await strip(page, name);
  }
});

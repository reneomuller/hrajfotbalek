import { expect, test } from "@playwright/test";
import { players, signInAs } from "./helpers/session.ts";

/**
 * `/admin/stats/transactions` — the financials CSV (round 8, item 3).
 *
 * THE COLUMNS ARE THE CONTRACT. Somebody reconciles a bank statement against
 * this file, so a renamed or reordered header is a silent break in whatever
 * they built on top of it — asserted exactly rather than loosely.
 *
 * THE BOM IS ASSERTED because it is invisible and load-bearing: without it
 * Excel on Windows reads the file as the local code page and every Czech venue
 * name arrives as mojibake. Nobody notices that in review; they notice it a
 * month later in a spreadsheet.
 */
test("the transactions export is Excel-safe and carries the agreed columns", async ({
  page,
  context,
}) => {
  await signInAs(context, players.organizer);

  await page.goto("/admin/stats", { waitUntil: "networkidle" });
  await expect(page.getByTestId("export-transactions")).toBeVisible();

  const res = await page.request.get("/admin/stats/transactions");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-type"]).toContain("charset=utf-8");
  expect(res.headers()["content-disposition"]).toContain("attachment");

  const body = await res.text();

  // UTF-8 BOM, first byte.
  expect(body.charCodeAt(0), "no BOM — Excel will mojibake Czech venue names").toBe(
    0xfeff,
  );

  const lines = body.split("\r\n");
  expect(lines[0]).toBe("﻿date,player,reference,amount_czk,method,status");

  // CRLF records, per RFC 4180 — and what Excel expects.
  expect(body).toContain("\r\n");

  const rows = lines.slice(1).filter((line) => line.trim() !== "");
  expect(rows.length, "no transactions to export from the seed").toBeGreaterThan(0);

  for (const row of rows) {
    const method = row.split(",")[4];
    // THE UI'S VOCABULARY, not the database's — `qr` reads as `online`,
    // because that is what the player was shown (ruling R3).
    expect(["credit", "cash", "online"], `unexpected method ${method}`).toContain(method);
  }

  /*
   * A signed-out request must not get the FILE. The route calls
   * `requireAdmin()` itself: a route handler is reachable without rendering
   * any page under the admin layout, so the layout's gate does not cover it.
   *
   * `maxRedirects: 0` IS THE POINT. The first version asserted `status !== 200`
   * and failed — not because the file leaked, but because `requireAdmin()`
   * answers with a 307 to `/login` and the request client followed it to a
   * perfectly good login page. Asserting on the followed status tests the
   * redirect target, not the guard. What matters is that no CSV comes back.
   */
  await context.clearCookies();
  const denied = await page.request.get("/admin/stats/transactions", {
    maxRedirects: 0,
  });
  expect(denied.status(), "an anonymous request was not redirected").toBe(307);
  expect(denied.headers()["location"]).toContain("/login");
  expect(denied.headers()["content-type"] ?? "").not.toContain("text/csv");
  expect(await denied.text()).not.toContain("amount_czk");
});

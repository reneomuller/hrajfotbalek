import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session.ts";

/**
 * G2 home-page specs (§6).
 *
 * `site_settings` is a SINGLETON, which makes it the one thing in this suite
 * that cannot be built and torn down per spec — there is one row and every
 * spec touching it shares it. So each spec here reads the value first and puts
 * it back afterwards, rather than assuming a starting state. A suite whose
 * result depends on the order it ran in is the flake that cannot be
 * reproduced.
 */

async function readSetting(key: string): Promise<unknown> {
  const admin = serviceClient();
  const { data } = await admin
    .from("site_settings")
    .select("settings")
    .eq("id", "singleton")
    .maybeSingle();
  return (data?.settings as Record<string, unknown> | undefined)?.[key] ?? null;
}

async function writeSetting(key: string, value: unknown): Promise<void> {
  const admin = serviceClient();
  const { error } = await admin.rpc("set_site_setting", { p_key: key, p_value: value });
  if (error) throw new Error(`set_site_setting(${key}): ${error.message}`);
}

/*
 * TEST-224 — the home page reads its settings ANONYMOUSLY.
 *
 * The assertion that matters is the signed-out one. Supabase grants nothing by
 * default here, so a missing grant would return empty rather than erroring —
 * and an empty stats strip looks like a content problem, not a permissions
 * one. This is the most repeated lesson in the project, and this is the table
 * where it would be least visible.
 */
test("a signed-out visitor sees the community count and the panels", async ({
  page,
}) => {
  const previous = await readSetting("active_players");

  try {
    await writeSetting("active_players", 250);

    // No session at all — a fresh context, straight to the landing page.
    await page.goto("/");

    /*
     * ONE PLACE, AND ONE ONLY. The stats strip that also carried this number
     * was removed on review: the same figure in two places invites the reader
     * to check whether they agree, which is a job the page should not hand
     * out. The community heading is where it lives.
     */
    await expect(page.getByTestId("stats-strip")).toHaveCount(0);
    await expect(page.getByTestId("community-heading")).toContainText("250");

    // REQ-HOME-005 — three panels.
    await expect(page.getByTestId("faq-panel")).toBeVisible();
    await expect(page.getByTestId("potm-panel")).toBeVisible();

    // REQ-HOME-001 — how-it-works, with the equipment line beneath it.
    await expect(page.getByTestId("how-it-works")).toBeVisible();
    await expect(page.getByTestId("equipment-line")).toContainText("bibs");
  } finally {
    await writeSetting("active_players", previous ?? 0);
  }
});

/*
 * REQ-HOME-007 — the six FAQ entries, as specified.
 */
test("the FAQ carries all six entries and they open", async ({ page }) => {
  await page.goto("/");

  const entries = page.getByTestId("faq-panel").locator("details");
  await expect(entries).toHaveCount(6);

  // Closed to begin with, and openable without JavaScript state.
  const first = entries.first();
  await expect(first.locator("p")).toBeHidden();
  await first.locator("summary").click();
  await expect(first.locator("p")).toBeVisible();
});

/*
 * The games-per-week tile is gone entirely, along with the stats strip that
 * held it. Asserted rather than merely deleted: a removal nobody checks is a
 * removal that comes back.
 */
test("the games-per-week tile no longer renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("stat-games-per-week")).toHaveCount(0);
  await expect(page.getByTestId("stats-strip")).toHaveCount(0);
});

/*
 * TEST-225 — an admin changes the number, the home page reflects it, and an
 * event records who did it.
 */
test("an admin changes the active-player number and the change is recorded", async ({
  page,
  context,
}) => {
  const previous = await readSetting("active_players");
  const admin = serviceClient();

  const { count: eventsBefore } = await admin
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "site_setting_changed");

  try {
    await signInAs(context, players.organizer);
    await page.goto("/admin/site");

    await page.getByTestId("active-players-input").fill("312");
    await page.getByTestId("active-players-submit").click();
    await expect(page.getByTestId("active-players-saved")).toBeVisible();

    // The home page reflects it — in the one place it now appears.
    await page.goto("/");
    await expect(page.getByTestId("community-heading")).toContainText("312");

    // And the event records the change. A public claim about the size of the
    // community with no audit trail is a number nobody can account for.
    const { count: eventsAfter, data } = await admin
      .from("events")
      .select("player_id, metadata", { count: "exact" })
      .eq("event_type", "site_setting_changed")
      .order("created_at", { ascending: false })
      .limit(1);

    expect(eventsAfter).toBeGreaterThan(eventsBefore ?? 0);
    expect(data?.[0]?.player_id).toBe(players.organizer.id);
    expect((data?.[0]?.metadata as { value?: unknown })?.value).toBe(312);
  } finally {
    await writeSetting("active_players", previous ?? 0);
  }
});

/*
 * REQ-HOME-006 — Player of the Month falls back to initials.
 *
 * The fallback is not a degraded state: the pick recognises how someone plays,
 * not whether they uploaded a picture.
 */
test("player of the month renders, with initials when there is no photo", async ({
  page,
}) => {
  const previous = await readSetting("player_of_month");

  try {
    await writeSetting("player_of_month", players.runner.id);

    await page.goto("/");
    await expect(page.getByTestId("potm-nickname")).toHaveText(players.runner.nickname);
    // No photo on this seeded player, so initials — and no broken image.
    await expect(page.getByTestId("potm-photo")).toHaveCount(0);
    await expect(page.getByTestId("potm-avatar")).toContainText(/[A-Z]/);

    // Cleared, the panel invites rather than showing an empty frame.
    await writeSetting("player_of_month", null);
    await page.goto("/");
    await expect(page.getByTestId("potm-nickname")).toHaveCount(0);
    await expect(page.getByTestId("potm-panel")).toContainText("Nobody picked yet");
  } finally {
    await writeSetting("player_of_month", previous ?? null);
  }
});

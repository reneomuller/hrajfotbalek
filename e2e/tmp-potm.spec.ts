import { expect, test } from "@playwright/test";
import { players, serviceClient, apiClientFor } from "./helpers/session.ts";

test("potm hours path", async ({ page }) => {
  const admin = serviceClient();
  const { data: before } = await admin
    .from("site_settings").select("settings").eq("id", "singleton").maybeSingle();
  const previous = (before?.settings as Record<string, unknown>) ?? {};

  // A played game this month with a booking by the runner.
  const { data: rows } = await admin
    .from("bookings")
    .select("id, player_id, game_id, attendance, games(starts_at, duration_minutes)")
    .eq("player_id", players.runner.id)
    .limit(20);
  console.log("POTM bookings for runner: " + JSON.stringify(rows?.map((r) => ({
    id: r.id.slice(0, 8), att: r.attendance, g: (r as never as {games:{starts_at:string}}).games?.starts_at?.slice(0, 10),
  }))));

  const past = rows?.find((r) => {
    const g = (r as never as { games: { starts_at: string } }).games;
    return g && new Date(g.starts_at) < new Date();
  });
  if (!past) { console.log("POTM no past booking to mark"); return; }

  const organizer = await apiClientFor(players.organizer);
  const marked = await organizer.rpc("mark_attendance", {
    p_booking_id: past.id, p_attendance: "present",
  });
  console.log("POTM mark_attendance error: " + JSON.stringify(marked.error));

  await admin.rpc("set_site_setting", { p_key: "player_of_month", p_value: players.runner.id });
  await page.goto("/", { waitUntil: "networkidle" });
  const panel = page.getByTestId("potm-panel");
  await expect(panel).toBeVisible();
  const hours = await page.getByTestId("potm-hours").count();
  console.log("POTM hours element count: " + hours);
  if (hours) console.log("POTM hours text: " + (await page.getByTestId("potm-hours").textContent()));

  // restore
  await organizer.rpc("mark_attendance", { p_booking_id: past.id, p_attendance: null });
  await admin.rpc("set_site_setting", {
    p_key: "player_of_month", p_value: previous.player_of_month ?? null,
  });
});

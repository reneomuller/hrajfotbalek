import { expect, test } from "@playwright/test";
import { execAsOwner } from "./helpers/clock";
import { createScratchGame, destroyScratchGame, gamePathOf } from "./helpers/scaffold";
import { apiClientFor, players, serviceClient } from "./helpers/session";

/**
 * The lineup's flags (the owner, 2026-11-11): "when in a game page you see
 * players, could we make a little flag on the bottom right of their profile
 * pic? the one they have as their nationality".
 */
test("a player's nationality flag sits on the bottom right of their face in the lineup", async ({ page }) => {
  // Arrange — the runner as Czech, booked onto a scratch game; the country is
  // put back afterwards, because the seed is shared by every spec.
  const { data: before } = await serviceClient()
    .from("players")
    .select("country")
    .eq("id", players.runner.id)
    .single();
  const game = await createScratchGame({ durationMinutes: 90, hoursFromNow: 48 });

  try {
    await execAsOwner("update public.players set country = 'CZ' where id = $1", [players.runner.id]);
    const runner = await apiClientFor(players.runner);
    const { error } = await runner.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });
    expect(error).toBeNull();

    // Act
    await page.goto(await gamePathOf(game.id));
    const row = page.getByTestId("roster-player-link").filter({ hasText: players.runner.nickname });

    // Assert — the flag is there, it is the right one, and it sits over the
    // face's bottom-right corner rather than beside the name.
    const flag = row.getByTestId("roster-avatar-flag");
    await expect(flag).toBeVisible();
    await expect(flag.getByTestId("country-flag")).toHaveAttribute("data-country", "CZ");

    // The owner: the face's outline passes through the flag's middle — its
    // centre ON the outline, at 45° to the bottom right.
    const face = (await row.getByTestId("roster-avatar").boundingBox())!;
    const badge = (await flag.boundingBox())!;
    const radius = face.width / 2;
    const dx = badge.x + badge.width / 2 - (face.x + radius);
    const dy = badge.y + badge.height / 2 - (face.y + face.height / 2);
    expect(Math.abs(Math.hypot(dx, dy) - radius), "the flag's centre is on the outline").toBeLessThan(1.5);
    expect(dx, "to the right").toBeGreaterThan(0);
    expect(dy, "and below").toBeGreaterThan(0);
    expect(Math.abs(dx - dy), "at 45°, bottom right").toBeLessThan(1.5);
    expect(badge.width, "a 14px flag").toBeLessThan(16);
  } finally {
    await execAsOwner("update public.players set country = $2 where id = $1", [
      players.runner.id,
      before?.country ?? null,
    ]);
    await destroyScratchGame(game.id);
  }
});

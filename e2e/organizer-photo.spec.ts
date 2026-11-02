import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * ROUND 42 — the organizer is a player, and the game page shows their photo.
 *
 * The owner: "on every game card we have an organizer. it currently doesn't
 * show an image/profile pic. I'd like that to be visible" — and he chose to
 * PICK the organizer from the players in the admin form. The SQL side is
 * drilled in `supabase/tests/organizer_player.sql`; this is the page.
 */

test("a linked organizer shows their photo, and the name and face link to their profile", async ({
  page,
}) => {
  // Arrange
  const admin = serviceClient();
  const game = await createScratchGame({ hoursFromNow: 24 * 3 });
  const { data: before } = await admin
    .from("players")
    .select("photo_path")
    .eq("id", players.runner.id)
    .single();
  const original = (before as { photo_path: string | null }).photo_path;

  try {
    await admin
      .from("players")
      .update({ photo_path: `players/${players.runner.id}.webp` })
      .eq("id", players.runner.id);
    const { error } = await admin.rpc("set_game_organizer_player", {
      p_game_id: game.id,
      p_player_id: players.runner.id,
    });
    expect(error).toBeNull();

    // Act
    await page.goto(`/game/${game.id}`);

    // Assert
    const link = page.getByTestId("organizer-profile-link");
    await expect(link).toHaveAttribute(
      "href",
      `/player/${encodeURIComponent(players.runner.nickname)}`,
    );
    await expect(link.getByTestId("organizer-avatar-photo")).toHaveAttribute(
      "src",
      new RegExp(`players(/|%2F)${players.runner.id}\\.webp`),
    );
  } finally {
    await admin.from("players").update({ photo_path: original }).eq("id", players.runner.id);
    await destroyScratchGame(game.id);
  }
});

test("an organizer who is only a typed name keeps their initials and links nowhere", async ({
  page,
}) => {
  // Arrange — `createScratchGame` names the organizer and links no player.
  const game = await createScratchGame({ hoursFromNow: 24 * 3 });

  try {
    // Act
    await page.goto(`/game/${game.id}`);

    // Assert
    await expect(page.getByTestId("organizer-avatar")).toBeVisible();
    await expect(page.getByTestId("organizer-avatar-photo")).toHaveCount(0);
    await expect(page.getByTestId("organizer-profile-link")).toHaveCount(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("the admin's new-game form offers the players, starting on the admin", async ({
  page,
  context,
}) => {
  // Arrange
  await signInAs(context, players.organizer);

  // Act
  await page.goto("/admin/games/new");

  // Assert
  const picker = page.getByTestId("organizer-player");
  await expect(picker).toHaveValue(players.organizer.id);
  await expect(picker.locator(`option[value="${players.runner.id}"]`)).toHaveText(
    players.runner.nickname,
  );
});

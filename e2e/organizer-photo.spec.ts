import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * ROUND 42 — organizers are players, and the game page shows their photo.
 *
 * The owner: "on every game card we have an organizer. it currently doesn't
 * show an image/profile pic. I'd like that to be visible" — then "'make
 * organizer' next to the option of making the user admin. then, for each game
 * we create, there should simply be a dropdown of the users we gave organizer
 * status to." The SQL side is drilled in `supabase/tests/organizer_player.sql`;
 * these are the pages.
 *
 * EVERY TEST PUTS ORGANIZER STATUS BACK. Other specs fill the game form's typed
 * name, which is what the form shows while nobody is an organizer.
 */

const setOrganizer = async (playerId: string, isOrganizer: boolean) => {
  const { error } = await serviceClient().rpc("admin_set_organizer", {
    p_player_id: playerId,
    p_is_organizer: isOrganizer,
  });
  expect(error, error?.message).toBeNull();
};

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
    await setOrganizer(players.runner.id, true);
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
    await setOrganizer(players.runner.id, false);
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

test("the new-game form's dropdown offers organizers only, starting on the admin", async ({
  page,
  context,
}) => {
  // Arrange — the admin is an organizer; Runner is not.
  await setOrganizer(players.organizer.id, true);
  try {
    await signInAs(context, players.organizer);

    // Act
    await page.goto("/admin/games/new");

    // Assert
    const picker = page.getByTestId("organizer-player");
    await expect(picker).toHaveValue(players.organizer.id);
    await expect(picker.locator(`option[value="${players.organizer.id}"]`)).toHaveText(
      players.organizer.nickname,
    );
    await expect(picker.locator(`option[value="${players.runner.id}"]`)).toHaveCount(0);
    // The typed name is gone while there is somebody to choose.
    await expect(page.getByTestId("organizer-name")).toHaveCount(0);
  } finally {
    await setOrganizer(players.organizer.id, false);
  }
});

test("Make organizer sits beside Make admin, and its other press takes it back", async ({
  page,
  context,
}) => {
  // Arrange
  const admin = serviceClient();
  const isOrganizer = async () =>
    ((await admin.from("players").select("is_organizer").eq("id", players.runner.id).single())
      .data as { is_organizer: boolean }).is_organizer;

  try {
    await signInAs(context, players.organizer);
    await page.goto(`/admin/players/${players.runner.id}`, { waitUntil: "networkidle" });
    const actions = page.getByTestId("admin-actions");
    await expect(actions.getByTestId("make-admin")).toBeVisible();

    // Act — grant, retrying a click that lands before hydration.
    await expect(async () => {
      await actions.getByTestId("make-organizer").click();
      await expect(actions.getByTestId("revoke-organizer")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    // Assert
    expect(await isOrganizer()).toBe(true);

    // Act — and take it back.
    await actions.getByTestId("revoke-organizer").click();
    await expect(actions.getByTestId("make-organizer")).toBeVisible();
    await expect.poll(isOrganizer).toBe(false);
  } finally {
    await setOrganizer(players.runner.id, false);
  }
});

test("a game created through the form runs under the chosen organizer's nickname", async ({
  page,
  context,
}) => {
  // Arrange
  const admin = serviceClient();
  await setOrganizer(players.organizer.id, true);
  await signInAs(context, players.organizer);
  const venue = (await admin.from("venues").select("id").limit(1).single()).data!;
  const when = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 16);
  let id: string | null = null;

  try {
    // Act
    await page.goto("/admin/games/new", { waitUntil: "networkidle" });
    await page.getByTestId("venue-select").selectOption(venue.id);
    await page.selectOption("#surface", "turf");
    await page.getByTestId("starts-at").fill(when);
    await expect(page.getByTestId("organizer-player")).toHaveValue(players.organizer.id);
    await page.getByTestId("game-form-submit").click();
    await page.waitForURL(/\/admin\/games\/[0-9a-f-]{36}/, { timeout: 20_000 });
    id = new URL(page.url()).pathname.split("/").pop()!;

    // Assert — the name is the nickname, read back on the server, and linked.
    const { data: contact } = await admin
      .from("game_organizer_contacts")
      .select("organizer_name, organizer_player_id")
      .eq("game_id", id)
      .single();
    expect(contact).toEqual({
      organizer_name: players.organizer.nickname,
      organizer_player_id: players.organizer.id,
    });
  } finally {
    if (id) await admin.from("games").delete().eq("id", id);
    await setOrganizer(players.organizer.id, false);
  }
});

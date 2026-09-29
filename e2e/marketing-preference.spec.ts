import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session.ts";

/**
 * The marketing opt-in, changeable after signup (round 38).
 *
 * The signup box promises "You can unsubscribe at any time", and until this
 * control existed nothing let a player keep that promise — `marketing_opt_in`
 * was written once by `complete_signup_v2` and never again.
 *
 * ASSERTED ON THE DATABASE AND ON A RELOAD, not on the switch's own state: a
 * client-rendered `aria-checked` can flip without the write landing, and
 * CLAUDE.md records that client-state markers do not survive `revalidatePath`.
 */

async function storedOptIn(playerId: string): Promise<boolean> {
  const { data, error } = await serviceClient()
    .from("players")
    .select("marketing_opt_in")
    .eq("id", playerId)
    .single();
  expect(error).toBeNull();
  return Boolean(data?.marketing_opt_in);
}

async function setStoredOptIn(playerId: string, value: boolean) {
  const { error } = await serviceClient()
    .from("players")
    .update({ marketing_opt_in: value })
    .eq("id", playerId);
  expect(error).toBeNull();
}

test("a player can turn marketing emails on and off from their profile", async ({
  page,
  context,
}) => {
  // Arrange — a known starting point, restored afterwards so the seed
  // tableau is not left in whatever state this spec finished in.
  const original = await storedOptIn(players.runner.id);
  await setStoredOptIn(players.runner.id, false);

  try {
    await signInAs(context, players.runner);
    await page.goto("/account");
    const toggle = page.getByTestId("marketing-toggle");
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    // Act — on.
    await toggle.click();

    // Assert — the database, then what the server renders next.
    await expect.poll(() => storedOptIn(players.runner.id)).toBe(true);
    await page.reload();
    await expect(page.getByTestId("marketing-toggle")).toHaveAttribute("aria-checked", "true");

    // Act — and off again: unsubscribing is the half the promise is about.
    await page.getByTestId("marketing-toggle").click();

    // Assert
    await expect.poll(() => storedOptIn(players.runner.id)).toBe(false);
    await page.reload();
    await expect(page.getByTestId("marketing-toggle")).toHaveAttribute("aria-checked", "false");
  } finally {
    await setStoredOptIn(players.runner.id, original);
  }
});

import { expect, test } from "@playwright/test";
import { clearActiveBookings, createScratchGame, destroyScratchGame, setWalletTo } from "./helpers/scaffold";
import { players, signInAs } from "./helpers/session";

/**
 * "Add to calendar" opens Google Calendar with the game filled in, on any
 * phone (the owner, 2026-11-13: "I'd like both android and iphone to prompt
 * google calendar and make it a one click addition"). The .ics download stays
 * beneath it for Apple and other calendars.
 */
test("the booking confirmation offers Google Calendar first, with the game filled in, and the .ics second", async ({
  page,
  context,
}) => {
  // Arrange — a ninety-minute game, booked from Credits.
  const game = await createScratchGame({ durationMinutes: 90, hoursFromNow: 48 });
  try {
    await clearActiveBookings("runner");
    await setWalletTo(players.runner.id, 180);
    await signInAs(context, players.runner);
    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
    await page.getByTestId("pay-credit-input").check();
    await page.getByTestId("terms-accept").check();

    // Act
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation/);

    // Assert — Google Calendar, in a new tab, with this game's start and end.
    const google = page.getByTestId("google-calendar-link");
    await expect(google).toBeVisible();
    await expect(google).toHaveAttribute("target", "_blank");
    const url = new URL((await google.getAttribute("href"))!);
    expect(`${url.origin}${url.pathname}`).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    const start = new Date(game.startsAt);
    const end = new Date(start.getTime() + 90 * 60_000);
    const stamp = (d: Date) => `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
    expect(url.searchParams.get("dates")).toBe(`${stamp(start)}/${stamp(end)}`);
    expect(url.searchParams.get("details")).toMatch(/\/game\//);

    // And the file, for everyone else.
    await expect(page.getByTestId("ics-link")).toHaveAttribute("href", `/game/${game.id}/ics`);
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(game.id);
  }
});

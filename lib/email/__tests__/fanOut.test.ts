import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fanOutGameCancelled, resetFanOutGuard } from "@/lib/email/dispatch";

const logs: unknown[][] = [];

const input = {
  gameId: "game-1",
  venue: "Pražačka",
  startsAt: "2026-07-25T16:00:00.000Z",
  gameUrl: "https://hrajfotbal.com/games",
  accountUrl: "https://hrajfotbal.com/account",
  recipients: [
    // paid — gets the notice AND the credit receipt
    { bookingId: "b1", email: "paid@example.com", nickname: "Paid", creditCzk: 200 },
    // unpaid reservation — notice only, nothing to receipt
    { bookingId: "b2", email: "unpaid@example.com", nickname: "Unpaid", creditCzk: 0 },
    // shadow player with no address — skipped, not an error
    { bookingId: "b3", email: null, nickname: "Shadow", creditCzk: 200 },
  ],
};

describe("game_cancelled fan-out", () => {
  beforeEach(() => {
    logs.length = 0;
    resetFanOutGuard();
    process.env.EMAIL_DRY_RUN = "on";
    vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("notices every affected player and receipts only the credited ones", async () => {
    const summary = await fanOutGameCancelled(input);

    expect(summary.notices).toBe(2);
    expect(summary.receipts).toBe(1);
    expect(summary.skippedNoEmail).toBe(1);
    expect(logs).toHaveLength(3);
  });

  it("sends nothing extra on a re-run", async () => {
    await fanOutGameCancelled(input);
    logs.length = 0;

    const second = await fanOutGameCancelled(input);

    expect(second.notices).toBe(0);
    expect(second.receipts).toBe(0);
    expect(second.skippedAlreadySent).toBe(3);
    expect(logs).toHaveLength(0);
  });

  it("resumes a partial fan-out without re-sending the delivered half", async () => {
    // First pass delivers only the first recipient.
    await fanOutGameCancelled({ ...input, recipients: input.recipients.slice(0, 1) });
    logs.length = 0;

    // Resume with the full list: the already-delivered pair is skipped.
    const resumed = await fanOutGameCancelled(input);

    expect(resumed.skippedAlreadySent).toBe(2);
    expect(resumed.notices).toBe(1); // only the unpaid player
    expect(resumed.receipts).toBe(0);
    expect(logs).toHaveLength(1);
  });

  it("sends no email at all to a player with no address", async () => {
    const summary = await fanOutGameCancelled({
      ...input,
      recipients: [input.recipients[2]],
    });
    expect(summary).toMatchObject({ notices: 0, receipts: 0, skippedNoEmail: 1 });
    expect(logs).toHaveLength(0);
  });
});

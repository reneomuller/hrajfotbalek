/**
 * game-cancelled email — live dry-run evidence.
 *
 * Run:  node --env-file=.env.local ./node_modules/vitest/vitest.mjs run \
 *         --config vitest.integration.config.ts
 *
 * WHY THIS EXISTS. M3 proved the game-cancellation STATE fan-out against the
 * live database (`verify-m3.mjs` calls `cancel_game` and checks the events),
 * but the EMAIL fan-out lives in the Phase 18 server action, which had no
 * mounting surface until Phase 21 put `CancelGameButton` on the edit page. So
 * the game-cancelled email was the one transactional email with no live
 * dry-run evidence behind it. This is that evidence.
 *
 * WHAT IT ACTUALLY EXERCISES. The real `collectCancelledRecipients` and the
 * real `fanOutGameCancelled`, over rows a real `cancel_game` transaction just
 * wrote — the same two calls, in the same order, as `cancelGameAction`. What
 * it does NOT exercise is `requireAdmin()` and the session-client RPC call:
 * those need a browser session, and they are what the human verifies at the
 * gate by pressing the button. Stated plainly so the evidence is not read as
 * covering more than it does.
 *
 * EMAIL_DRY_RUN stays on. `isDryRun()` defaults to ON unless explicitly turned
 * off, and this asserts it rather than assuming: a harness that mailed real
 * players would be a spectacular way to prove an email works.
 *
 * Fixtures are created and removed here, including on failure. It is kept out
 * of the unit suite (own vitest config) because it talks to the live database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { collectCancelledRecipients } from "@/lib/email/cancelFanOut";
import { fanOutGameCancelled, resetFanOutGuard } from "@/lib/email/dispatch";
import { isDryRun } from "@/lib/email/sendEmail";
import type { Database } from "@/lib/types/database";

const STAMP = Date.now();
const ids = {
  game: crypto.randomUUID(),
  paid: crypto.randomUUID(),
  unpaid: crypto.randomUUID(),
  shadow: crypto.randomUUID(),
};

let service: SupabaseClient<Database>;

beforeAll(() => {
  service = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
});

afterAll(async () => {
  // Order matters: bookings and ledger rows reference players and the game.
  await service.from("events").delete().eq("game_id", ids.game);
  await service.from("bookings").delete().eq("game_id", ids.game);
  for (const player of [ids.paid, ids.unpaid, ids.shadow]) {
    await service.from("credit_ledger").delete().eq("player_id", player);
    await service.from("events").delete().eq("player_id", player);
    await service.from("players").delete().eq("id", player);
  }
  await service.from("games").delete().eq("id", ids.game);
});

describe("game-cancelled fan-out (dry run)", () => {
  it("refuses to run unless the dry-run seam is on", () => {
    expect(isDryRun()).toBe(true);
  });

  it("mails a notice to everyone and a receipt only to the credited", async () => {
    // --- fixtures -------------------------------------------------------------
    await service.from("players").insert([
      { id: ids.paid, nickname: `CxPaid${STAMP % 1000}`, email: `cx-paid-${STAMP}@test.invalid` },
      { id: ids.unpaid, nickname: `CxHold${STAMP % 1000}`, email: `cx-hold-${STAMP}@test.invalid` },
      // A shadow with no email: skipped, and skipping is not a failure.
      { id: ids.shadow, nickname: `CxShad${STAMP % 1000}`, email: null },
    ]);

    await service.from("games").insert({
      id: ids.game,
      venue: `Cancel Evidence ${STAMP}`,
      starts_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      capacity: 10,
      price_czk: 200,
      status: "published",
    });

    // Bookings go through `admin_create_booking`, not a direct insert — and
    // could not go any other way: service_role holds no INSERT grant on
    // `bookings`, which is the invariant the whole project rests on, enforced
    // against this harness exactly as it is against the app.
    const booked: Record<string, string> = {};
    for (const [label, playerId] of [["paid", ids.paid], ["unpaid", ids.unpaid], ["shadow", ids.shadow]] as const) {
      const { data, error: bookErr } = await service.rpc("admin_create_booking", {
        p_game_id: ids.game,
        p_player_id: playerId,
        p_payment_method: "cash",
      });
      expect(bookErr, `${label} booking`).toBeNull();
      booked[label] = (data as unknown as { id: string }).id;
    }

    // Only the first is paid up. The second stays a held, unpaid reservation —
    // which is what makes the receipt asymmetry below meaningful.
    const { error: confirmErr } = await service.rpc("confirm_booking", {
      p_booking_id: booked.paid,
    });
    expect(confirmErr).toBeNull();
    const { error: shadowConfirmErr } = await service.rpc("confirm_booking", {
      p_booking_id: booked.shadow,
    });
    expect(shadowConfirmErr).toBeNull();

    // --- the real transition --------------------------------------------------
    const { data: cancelled, error } = await service.rpc("cancel_game", { p_game_id: ids.game });
    expect(error).toBeNull();
    expect(cancelled).toBe(3);

    // --- the real fan-out, over what that transaction wrote -------------------
    resetFanOutGuard();
    const logged: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });

    const recipients = await collectCancelledRecipients(service, ids.game);
    const summary = await fanOutGameCancelled({
      gameId: ids.game,
      venue: `Cancel Evidence ${STAMP}`,
      startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      gameUrl: "https://hrajfotbal.com/games",
      accountUrl: "https://hrajfotbal.com/account",
      recipients,
    });

    spy.mockRestore();
    for (const line of logged) console.log("EVIDENCE", line);

    // Three bookings cancelled: two with an email, one shadow without.
    expect(recipients).toHaveLength(3);

    // A notice for each addressable player — the game is off, everyone hears.
    expect(summary.notices).toBe(2);

    // A receipt ONLY for the confirmed booking whose money came back. The
    // unpaid hold gets no receipt: a "0 CZK credited" receipt reads as a bug.
    expect(summary.receipts).toBe(1);

    // The email-less shadow is skipped, and that is a normal outcome.
    expect(summary.skippedNoEmail).toBe(1);

    // Every send went through the dry-run seam and logged rather than posting.
    expect(logged.filter((line) => line.includes("[sendEmail:dry-run]"))).toHaveLength(3);
    expect(logged.some((line) => line.includes(`cx-paid-${STAMP}@test.invalid`))).toBe(true);
    expect(logged.some((line) => line.includes(`cx-hold-${STAMP}@test.invalid`))).toBe(true);

    // The credit the receipt reports is the credit the RPC actually issued.
    const paid = recipients.find((r) => r.email === `cx-paid-${STAMP}@test.invalid`);
    expect(paid?.creditCzk).toBe(200);
    const held = recipients.find((r) => r.email === `cx-hold-${STAMP}@test.invalid`);
    expect(held?.creditCzk).toBe(0);
  }, 60_000);
});

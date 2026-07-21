import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  TEMPLATE_BY_EVENT,
  dispatchEmail,
  resolveTemplate,
  type DispatchContext,
} from "@/lib/email/dispatch";

const ctx: DispatchContext = {
  nickname: "Player_1",
  venue: "Pražačka",
  startsAt: "2026-07-25T16:00:00.000Z",
  gameUrl: "https://hrajfotbal.com/game/abc",
  accountUrl: "https://hrajfotbal.com/account",
  amountDueCzk: 150,
  variableSymbol: 2600000042,
  spdString: "SPD*1.0*",
  creditCzk: 150,
};

describe("dispatch map", () => {
  it("maps exactly the eight in-app trigger events", () => {
    expect(Object.keys(TEMPLATE_BY_EVENT).sort()).toEqual(
      [
        "booking_cancelled",
        "booking_created",
        "booking_expired",
        "game_cancelled",
        "nudge_sent",
        "payment_confirmed",
        "reminder_sent",
        "waitlist_notified",
      ].sort(),
    );
  });

  it("resolves one template per event, with no template used twice", () => {
    const templates = Object.values(TEMPLATE_BY_EVENT);
    expect(new Set(templates).size).toBe(templates.length);
    expect(templates).toHaveLength(8);
  });

  it("has no magic_link key — Supabase delivers that email", () => {
    expect(TEMPLATE_BY_EVENT).not.toHaveProperty("magic_link");
    expect(resolveTemplate("magic_link")).toBeNull();
  });

  it.each([
    ["booking_created", "spot_held"],
    ["payment_confirmed", "payment_confirmed"],
    ["nudge_sent", "nudge"],
    ["booking_expired", "expiry"],
    ["waitlist_notified", "waitlist_spot_open"],
    ["booking_cancelled", "cancellation_credit"],
    ["game_cancelled", "game_cancelled"],
    ["reminder_sent", "reminder"],
  ])("%s resolves to %s", (event, template) => {
    expect(resolveTemplate(event)).toBe(template);
  });

  it("treats an unmapped event as a no-op rather than an error", () => {
    expect(resolveTemplate("spot_released")).toBeNull();
    expect(resolveTemplate("waitlist_joined")).toBeNull();
    expect(resolveTemplate("credit_redeemed")).toBeNull();
    expect(resolveTemplate("nonsense")).toBeNull();
  });
});

describe("dispatch instant-confirm suppression", () => {
  it("suppresses spot-held for an instant-confirmed booking", () => {
    expect(resolveTemplate("booking_created", { instantConfirmed: true })).toBeNull();
  });

  it("still sends spot-held for a normal QR booking", () => {
    expect(resolveTemplate("booking_created", { instantConfirmed: false })).toBe(
      "spot_held",
    );
  });

  it("still sends the receipt to an instant-confirmed booking", () => {
    expect(resolveTemplate("payment_confirmed", { instantConfirmed: true })).toBe(
      "payment_confirmed",
    );
  });
});

describe("dispatch sending", () => {
  const logs: unknown[][] = [];
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    logs.length = 0;
    vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
    // Any network call at all is a failure under dry-run.
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("dispatch must not touch the network under EMAIL_DRY_RUN");
    });
    process.env.EMAIL_DRY_RUN = "on";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs instead of sending, making zero network calls", async () => {
    const outcome = await dispatchEmail({
      event: "payment_confirmed",
      to: "player@example.com",
      context: ctx,
    });
    expect(outcome.sent).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logs[0]?.[0]).toContain("[sendEmail:dry-run]");
  });

  it("sends exactly one email for an instant-confirmed booking", async () => {
    const created = await dispatchEmail({
      event: "booking_created",
      to: "player@example.com",
      context: { ...ctx, instantConfirmed: true },
    });
    const confirmed = await dispatchEmail({
      event: "payment_confirmed",
      to: "player@example.com",
      context: { ...ctx, instantConfirmed: true },
    });

    expect(created).toEqual({ sent: false, reason: "suppressed" });
    expect(confirmed.sent).toBe(true);
    expect(logs).toHaveLength(1);
  });

  it("sends two emails for a QR booking that is later confirmed", async () => {
    await dispatchEmail({ event: "booking_created", to: "p@example.com", context: ctx });
    await dispatchEmail({ event: "payment_confirmed", to: "p@example.com", context: ctx });
    expect(logs).toHaveLength(2);
  });

  it("skips a recipient with no email rather than throwing", async () => {
    const outcome = await dispatchEmail({
      event: "payment_confirmed",
      to: null,
      context: ctx,
    });
    expect(outcome).toEqual({ sent: false, reason: "no_recipient" });
    expect(logs).toHaveLength(0);
  });

  it("is a silent no-op for an unmapped event", async () => {
    const outcome = await dispatchEmail({
      event: "spot_released",
      to: "p@example.com",
      context: ctx,
    });
    expect(outcome).toEqual({ sent: false, reason: "unmapped" });
    expect(logs).toHaveLength(0);
  });
});

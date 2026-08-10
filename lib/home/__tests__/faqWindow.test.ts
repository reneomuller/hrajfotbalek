import { describe, expect, it } from "vitest";
import { resolveStrings } from "@/lib/i18n/resolve";
import { cancellationReassurance } from "@/lib/booking/reassurance";
import { policy } from "@/lib/policy";

/**
 * Stage 5: the FAQ's cancellation window comes from `lib/policy.ts`.
 *
 * The entry is located by INDEX in the panel, because the question text is
 * translated and matching English would stop applying in Czech and Russian —
 * leaving those two with the hardcoded answer the change exists to remove.
 * This asserts the assumption that makes the index safe: the overlays replace
 * `faq.items` wholesale and in order, so position 3 is the cancellation
 * question in every language.
 */
const CANCELLATION_ITEM = 3;

describe("the FAQ cancellation entry", () => {
  it("sits at the same index in every language", () => {
    for (const locale of ["en", "cs", "ru"] as const) {
      const items = resolveStrings(locale).faq.items;
      expect(items.length, locale).toBe(resolveStrings("en").faq.items.length);
      expect(items[CANCELLATION_ITEM], locale).toBeDefined();
    }
  });

  it("renders the policy's window rather than a hardcoded one", () => {
    // Policy v1 has a zero cutoff, which reads "before kickoff".
    expect(policy.cancellation.cutoffHoursBeforeStart).toBe(0);
    const t = resolveStrings("en");
    expect(cancellationReassurance(policy.cancellation.cutoffHoursBeforeStart, t)).toBe(
      t.booking.cancelReassuranceKickoff,
    );
  });

  it("moves with a v2 policy instead of promising the old window", () => {
    // The failure this prevents: a cutoff ships, `cancel_booking` starts
    // refusing late cancellations, and the FAQ keeps saying "anytime".
    const t = resolveStrings("en");
    expect(cancellationReassurance(6, t)).toContain("6");
    expect(cancellationReassurance(6, t)).not.toBe(t.booking.cancelReassuranceKickoff);
  });
});

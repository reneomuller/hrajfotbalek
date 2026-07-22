import { describe, expect, it } from "vitest";
import { cancellationReassurance } from "@/lib/booking/reassurance";
import { policy } from "@/lib/policy";
import { strings } from "@/lib/strings";

describe("cancellationReassurance", () => {
  it("promises cancellation until kickoff under policy v1", () => {
    expect(cancellationReassurance(policy.cancellation.cutoffHoursBeforeStart))
      .toBe(strings.booking.cancelReassuranceKickoff);
  });

  it("states the lead time if policy v2 introduces one", () => {
    const line = cancellationReassurance(6);
    expect(line).toContain("6h");
    expect(line).not.toContain("{hours}");
  });

  it("never renders a placeholder token", () => {
    for (const hours of [0, 1, 12, 48]) {
      expect(cancellationReassurance(hours)).not.toContain("{hours}");
    }
  });
});

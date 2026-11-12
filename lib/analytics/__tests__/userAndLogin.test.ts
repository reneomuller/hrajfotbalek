import { describe, expect, it } from "vitest";
import { isLoginMethod, userIdBootstrapScript } from "@/lib/analytics/gtm";

/**
 * Two corrections to the GTM v4 patch (2026-11-12).
 */
describe("userIdBootstrapScript — the player id reaches the dataLayer BEFORE the container", () => {
  it("is nothing for a signed-out visitor", () => {
    expect(userIdBootstrapScript(null)).toBeNull();
  });

  it("pushes user_id and player_id as the internal id, ready for GA4's first page view", () => {
    // Arrange
    const id = "4e450000-0000-0000-0000-000000000013";
    const pushed: unknown[] = [];
    const window = { dataLayer: pushed };

    // Act — run the script against a stand-in window.
    new Function("window", userIdBootstrapScript(id)!)(window);

    // Assert
    expect(pushed).toEqual([{ user_id: id, player_id: id }]);
  });

  it("cannot be turned into markup by a hostile value", () => {
    expect(userIdBootstrapScript("</script><script>alert(1)</script>")).not.toContain("</script>");
  });
});

describe("isLoginMethod — every way a player signs in is counted", () => {
  it("counts the magic link as well as the password and the code", () => {
    expect(["password", "email", "magic_link"].every(isLoginMethod)).toBe(true);
  });

  it("ignores anything else in the address bar", () => {
    expect(isLoginMethod("admin")).toBe(false);
    expect(isLoginMethod(null)).toBe(false);
  });
});

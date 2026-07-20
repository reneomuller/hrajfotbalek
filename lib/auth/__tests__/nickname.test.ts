import { describe, expect, it } from "vitest";
import { NICKNAME_PATTERN, validateNickname } from "@/lib/auth/nickname";

describe("nickname", () => {
  it.each(["Player_1", "a", "A B C", "with-dash", "with_underscore", "12345", "12345678901234567890"])(
    "accepts %s",
    (input) => {
      expect(validateNickname(input)).toEqual({ valid: true, value: input });
    },
  );

  it.each([
    ["the acceptance-criterion example", "bad*name!"],
    ["an empty string", ""],
    ["21 characters", "123456789012345678901"],
    ["an angle bracket", "<script>"],
    ["an at sign", "player@home"],
    ["an accented letter", "Přemysl"],
    ["an emoji", "player🎉"],
    ["a newline", "line1\nline2"],
    ["a tab", "a\tb"],
  ])("rejects %s", (_label, input) => {
    expect(validateNickname(input)).toEqual({ valid: false, error: "NICKNAME_INVALID" });
  });

  it("trims surrounding whitespace rather than storing it", () => {
    expect(validateNickname("  Player_1  ")).toEqual({ valid: true, value: "Player_1" });
  });

  it("rejects a nickname that is only whitespace", () => {
    expect(validateNickname("     ")).toEqual({ valid: false, error: "NICKNAME_INVALID" });
  });

  it("rejects 21 characters even when padded to a trimmable length", () => {
    expect(validateNickname("  123456789012345678901  ")).toEqual({
      valid: false,
      error: "NICKNAME_INVALID",
    });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s without throwing", (_label, input) => {
    expect(validateNickname(input)).toEqual({ valid: false, error: "NICKNAME_INVALID" });
  });

  // The client pattern and the database CHECK must agree exactly. If they
  // drift, the form accepts something the database then rejects with a raw
  // constraint violation — the exact failure the friendly error exists to
  // prevent.
  it("uses the same source pattern as the players_nickname_format CHECK", () => {
    expect(NICKNAME_PATTERN.source).toBe("^[A-Za-z0-9 _-]{1,20}$");
  });
});

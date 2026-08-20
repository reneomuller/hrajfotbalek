import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  parseSignupForm,
  profileFromMetadata,
  signupMetadata,
} from "@/lib/auth/signupProfile";
import { TERMS_VERSION } from "@/lib/legal";

/** A form whose every field is valid, so each case varies exactly one thing. */
function form(overrides: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    email: "Player@Example.com",
    nickname: "GoodName",
    password: "longenough",
    country: "cz",
    skill: "intermediate",
    // REQUIRED SINCE ROUND 7, item 7. This fixture is "every field valid", so
    // an empty phone here would make six unrelated cases fail for a reason
    // none of them is about.
    phone: "+420600123456",
    tos: "on",
    gdpr: "on",
    ...overrides,
  };
  return {
    get: (name: string) => (name in fields ? fields[name] : null),
  };
}

describe("parseSignupForm", () => {
  it("accepts a complete submission and normalises what it can", () => {
    const result = parseSignupForm(form());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe("player@example.com");
    expect(result.value.country).toBe("CZ");
    expect(result.value.phone).toBe("+420600123456");
    expect(result.value.marketingOptIn).toBe(false);
    expect(result.value.tosVersion).toBe(TERMS_VERSION);
  });

  it("keeps a phone number when one is given, trimmed", () => {
    const result = parseSignupForm(form({ phone: "  +420600123456 " }));
    expect(result.ok && result.value.phone).toBe("+420600123456");
  });

  /*
   * PHONE IS REQUIRED (round 7, item 7).
   *
   * The organizer needs a way to reach a player about the game they are
   * standing on a pitch waiting for. Asserted on the PARSER rather than on the
   * form, because the parser is what a curl request meets — the `required`
   * attribute is a courtesy that saves a round trip.
   */
  describe("the phone number", () => {
    it("is required", () => {
      const result = parseSignupForm(form({ phone: "" }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.field).toBe("phone");
      expect(result.code).toBe("PHONE_REQUIRED");
    });

    it("treats whitespace as absent rather than as three characters", () => {
      const result = parseSignupForm(form({ phone: "   " }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("PHONE_REQUIRED");
    });

    it("refuses something too short to be a number", () => {
      const result = parseSignupForm(form({ phone: "12" }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.field).toBe("phone");
      expect(result.code).toBe("PHONE_INVALID");
    });

    it("refuses a pasted paragraph", () => {
      const result = parseSignupForm(form({ phone: "x".repeat(33) }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("PHONE_INVALID");
    });

    /*
     * NO FORMAT CHECK, and this is the decision rather than an omission.
     * Numbers are written a dozen ways across the three countries here and a
     * regex would reject more real numbers than fake ones.
     */
    it("accepts the shapes real people type", () => {
      for (const value of [
        "+420 600 123 456",
        "00420600123456",
        "600123456",
        "+41 79 123 45 67",
      ]) {
        const result = parseSignupForm(form({ phone: value }));
        expect(result.ok, `rejected ${value}`).toBe(true);
      }
    });
  });

  it("records the reminders preference when ticked", () => {
    const result = parseSignupForm(form({ marketing: "on" }));
    expect(result.ok && result.value.marketingOptIn).toBe(true);
  });

  it("rejects a malformed email before anything else", () => {
    const result = parseSignupForm(form({ email: "not-an-email", nickname: "!!bad!!" }));
    // Both are wrong; the email is the first field on the form, so it is the
    // error the player is shown.
    expect(result).toMatchObject({ ok: false, field: "email", code: "EMAIL_INVALID" });
  });

  it("rejects a short password", () => {
    const result = parseSignupForm(form({ password: "a".repeat(PASSWORD_MIN_LENGTH - 1) }));
    expect(result).toMatchObject({ ok: false, field: "password", code: "PASSWORD_TOO_SHORT" });
  });

  it("rejects a nickname outside the charset", () => {
    const result = parseSignupForm(form({ nickname: "<script>" }));
    expect(result).toMatchObject({ ok: false, field: "nickname", code: "NICKNAME_INVALID" });
  });

  it("rejects a country that is not on the list", () => {
    const result = parseSignupForm(form({ country: "ZZ" }));
    expect(result).toMatchObject({ ok: false, field: "country", code: "COUNTRY_INVALID" });
  });

  it("rejects a skill level outside the three", () => {
    const result = parseSignupForm(form({ skill: "expert" }));
    expect(result).toMatchObject({ ok: false, field: "skill", code: "SKILL_REQUIRED" });
  });

  describe("the two required legal acts", () => {
    it("refuses a submission with no TOS acceptance", () => {
      const result = parseSignupForm(form({ tos: "" }));
      expect(result).toMatchObject({ ok: false, field: "tos", code: "TOS_REQUIRED" });
    });

    it("refuses a submission with no data-processing consent", () => {
      const result = parseSignupForm(form({ gdpr: "" }));
      expect(result).toMatchObject({ ok: false, field: "gdpr", code: "CONSENT_REQUIRED" });
    });

    it("does not let one stand in for the other, in either direction", () => {
      // The whole reason they are two boxes: neither implies the other, and the
      // error has to name the one that is missing.
      expect(parseSignupForm(form({ tos: "on", gdpr: "" }))).toMatchObject({
        field: "gdpr",
        code: "CONSENT_REQUIRED",
      });
      expect(parseSignupForm(form({ tos: "", gdpr: "on" }))).toMatchObject({
        field: "tos",
        code: "TOS_REQUIRED",
      });
    });

    it("treats the optional preference as optional", () => {
      expect(parseSignupForm(form({ marketing: "" })).ok).toBe(true);
    });
  });
});

describe("signupMetadata", () => {
  const submission = (() => {
    const parsed = parseSignupForm(form({ phone: "+420600123456", marketing: "on" }));
    if (!parsed.ok) throw new Error("fixture should parse");
    return parsed.value;
  })();

  it("carries every profile fact the finalisation needs", () => {
    expect(signupMetadata(submission)).toMatchObject({
      nickname: "GoodName",
      country: "CZ",
      skill_level: "intermediate",
      phone: "+420600123456",
      marketing_opt_in: true,
      tos_version: TERMS_VERSION,
      tos_accepted: true,
      gdpr_consent: true,
    });
  });

  it("never carries the password", () => {
    // Supabase copies user metadata into the access token. Anything in here is
    // readable by whoever holds the session.
    const bag = JSON.stringify(signupMetadata(submission));
    expect(bag).not.toContain(submission.password);
    expect(Object.keys(signupMetadata(submission))).not.toContain("password");
  });
});

describe("profileFromMetadata", () => {
  const good = {
    nickname: "GoodName",
    country: "CZ",
    skill_level: "advanced",
    phone: "+420600123456",
    marketing_opt_in: true,
    tos_version: TERMS_VERSION,
    tos_accepted: true,
    gdpr_consent: true,
  };

  it("round-trips what signupMetadata wrote", () => {
    const parsed = parseSignupForm(form({ marketing: "on" }));
    if (!parsed.ok) throw new Error("fixture should parse");
    const profile = profileFromMetadata(signupMetadata(parsed.value), "player@example.com");
    expect(profile).toMatchObject({
      nickname: "GoodName",
      country: "CZ",
      skillLevel: "intermediate",
      marketingOptIn: true,
      email: "player@example.com",
    });
  });

  it("reads a complete bag", () => {
    expect(profileFromMetadata(good, "a@b.com")).toMatchObject({
      nickname: "GoodName",
      country: "CZ",
      skillLevel: "advanced",
      phone: "+420600123456",
    });
  });

  it("returns null rather than a partial profile", () => {
    // Each of these sends the player to the form instead of stranding them, so
    // every one has to be detected rather than defaulted.
    expect(profileFromMetadata(null, "a@b.com")).toBeNull();
    expect(profileFromMetadata({}, "a@b.com")).toBeNull();
    expect(profileFromMetadata({ ...good, nickname: "!!" }, "a@b.com")).toBeNull();
    expect(profileFromMetadata({ ...good, country: "ZZ" }, "a@b.com")).toBeNull();
    expect(profileFromMetadata({ ...good, skill_level: "expert" }, "a@b.com")).toBeNull();
    expect(profileFromMetadata({ ...good, tos_version: "  " }, "a@b.com")).toBeNull();
  });

  it("refuses a bag that does not record both consents", () => {
    expect(profileFromMetadata({ ...good, tos_accepted: false }, "a@b.com")).toBeNull();
    expect(profileFromMetadata({ ...good, gdpr_consent: false }, "a@b.com")).toBeNull();
    // Absent is not the same as true, and must not be read as it.
    const noTos: Record<string, unknown> = { ...good };
    delete noTos.tos_accepted;
    expect(profileFromMetadata(noTos, "a@b.com")).toBeNull();
  });

  it("treats a blank phone as no phone", () => {
    expect(profileFromMetadata({ ...good, phone: "   " }, "a@b.com")?.phone).toBeNull();
  });
});

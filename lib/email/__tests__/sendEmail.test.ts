import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDryRun, sendEmail } from "../sendEmail";

const payload = {
  to: "player@example.com",
  subject: "Your spot is reserved",
  html: "<p>See you on the pitch.</p>",
};

describe("sendEmail", () => {
  const originalEnv = { ...process.env };
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("logs instead of sending when EMAIL_DRY_RUN is on", async () => {
    process.env.EMAIL_DRY_RUN = "on";

    const result = await sendEmail(payload);

    expect(result).toMatchObject({ delivered: false, reason: "dry_run" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("logs instead of sending when EMAIL_DRY_RUN is unset (fail-safe default)", async () => {
    delete process.env.EMAIL_DRY_RUN;

    const result = await sendEmail(payload);

    expect(result).toMatchObject({ delivered: false, reason: "dry_run" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats an unrecognised EMAIL_DRY_RUN value as dry-run", async () => {
    process.env.EMAIL_DRY_RUN = "maybe";

    const result = await sendEmail(payload);

    expect(result).toMatchObject({ delivered: false, reason: "dry_run" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("only leaves dry-run on an explicit off-value", () => {
    for (const value of ["off", "false", "0", "no", "OFF"]) {
      process.env.EMAIL_DRY_RUN = value;
      expect(isDryRun()).toBe(false);
    }
    for (const value of ["on", "true", "1", "", "unexpected"]) {
      process.env.EMAIL_DRY_RUN = value;
      expect(isDryRun()).toBe(true);
    }
  });

  it("refuses to attempt delivery when dry-run is off but no API key is set", async () => {
    process.env.EMAIL_DRY_RUN = "off";
    delete process.env.RESEND_API_KEY;

    await expect(sendEmail(payload)).rejects.toThrow(/RESEND_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends via Resend when dry-run is explicitly off and a key is present", async () => {
    process.env.EMAIL_DRY_RUN = "off";
    process.env.RESEND_API_KEY = "re_test_key";
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email_123" }),
    });

    const result = await sendEmail(payload);

    expect(result).toEqual({ delivered: true, id: "email_123" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(init.body).to).toEqual(["player@example.com"]);
  });

  /**
   * The M5 cutover check, as its own block so the gate has one command to run:
   *
   *   npm run test:unit -- -t "sendEmail live"
   *
   * Everything the flip depends on is asserted here, because the flip itself is
   * a one-character config change whose blast radius is every player's inbox.
   */
  describe("live-send path", () => {
    it("takes the live branch only for an explicit off-value", async () => {
      process.env.RESEND_API_KEY = "re_test_key";
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: "email_live" }) });

      for (const value of ["off", "OFF", "false", "0", "no"]) {
        fetchSpy.mockClear();
        process.env.EMAIL_DRY_RUN = value;

        const result = await sendEmail(payload);

        expect(result).toEqual({ delivered: true, id: "email_live" });
        expect(fetchSpy).toHaveBeenCalledOnce();
      }
    });

    it("fails toward silence for every other value, including nonsense", async () => {
      process.env.RESEND_API_KEY = "re_test_key";

      // "true" is the one worth naming: someone reading `EMAIL_DRY_RUN` as
      // "should we send?" would set it to true meaning yes-send. It means
      // dry-run stays on, and nothing is sent. That is the safe direction.
      for (const value of ["on", "true", "1", "yes", "maybe", " ", ""]) {
        fetchSpy.mockClear();
        process.env.EMAIL_DRY_RUN = value;

        const result = await sendEmail(payload);

        expect(result).toMatchObject({ delivered: false, reason: "dry_run" });
        expect(fetchSpy).not.toHaveBeenCalled();
      }
    });

    it("fails toward silence when the flag is missing entirely", async () => {
      delete process.env.EMAIL_DRY_RUN;
      process.env.RESEND_API_KEY = "re_test_key";

      const result = await sendEmail(payload);

      expect(result).toMatchObject({ delivered: false, reason: "dry_run" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("refuses to send rather than half-sending when the key is missing", async () => {
      process.env.EMAIL_DRY_RUN = "off";
      delete process.env.RESEND_API_KEY;

      // Throwing beats returning a soft failure: a cutover done with the flag
      // flipped and the key not yet set should stop loudly on the first email,
      // not log a warning nobody reads while every notification silently dies.
      await expect(sendEmail(payload)).rejects.toThrow(/RESEND_API_KEY/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("sends from the configured identity, which must be the verified domain", async () => {
      process.env.EMAIL_DRY_RUN = "off";
      process.env.RESEND_API_KEY = "re_test_key";
      process.env.EMAIL_FROM = "Hraj Fotbal <noreply@hrajfotbal.com>";
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: "email_from" }) });

      await sendEmail(payload);

      const [, init] = fetchSpy.mock.calls[0];
      expect(JSON.parse(init.body).from).toBe("Hraj Fotbal <noreply@hrajfotbal.com>");
    });
  });
});

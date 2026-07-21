import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CRON_UNAUTHORIZED, isAuthorizedCron, rejectUnauthorizedCron } from "@/lib/cron/guard";

const SECRET = "test-cron-secret-value";

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://hrajfotbal.com/api/cron/expiry", { headers });
}

describe("cron guard", () => {
  const original = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("accepts the Vercel Cron Authorization header", () => {
    expect(isAuthorizedCron(request({ authorization: `Bearer ${SECRET}` }))).toBe(true);
  });

  it("accepts the x-cron-secret header used for manual curl runs", () => {
    expect(isAuthorizedCron(request({ "x-cron-secret": SECRET }))).toBe(true);
  });

  it("rejects a request with no header at all", () => {
    expect(isAuthorizedCron(request())).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(isAuthorizedCron(request({ "x-cron-secret": "wrong" }))).toBe(false);
    expect(isAuthorizedCron(request({ authorization: "Bearer wrong" }))).toBe(false);
  });

  it("rejects an empty secret header", () => {
    expect(isAuthorizedCron(request({ "x-cron-secret": "" }))).toBe(false);
  });

  it("rejects EVERYTHING when CRON_SECRET is unset", () => {
    // Treating an unset secret as "no auth required" would leave a freshly
    // deployed environment wide open, which is exactly when nobody is looking.
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCron(request({ "x-cron-secret": "anything" }))).toBe(false);
    expect(isAuthorizedCron(request({ authorization: "Bearer anything" }))).toBe(false);
    expect(isAuthorizedCron(request())).toBe(false);
  });

  it("returns a 401 CRON_UNAUTHORIZED response for a bad request", async () => {
    const response = rejectUnauthorizedCron(request({ "x-cron-secret": "nope" }));
    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
    await expect(response!.json()).resolves.toEqual({ error: CRON_UNAUTHORIZED });
  });

  it("returns null — meaning proceed — for an authorized request", () => {
    expect(rejectUnauthorizedCron(request({ authorization: `Bearer ${SECRET}` }))).toBeNull();
  });

  it("does not accept a secret that merely shares a prefix", () => {
    expect(isAuthorizedCron(request({ "x-cron-secret": SECRET.slice(0, -1) }))).toBe(false);
    expect(isAuthorizedCron(request({ "x-cron-secret": `${SECRET}x` }))).toBe(false);
  });
});

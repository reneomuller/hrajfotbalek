import { describe, expect, it } from "vitest";
import { submittedValues } from "@/app/signup/submittedValues";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

describe("submittedValues", () => {
  it("carries every text field back", () => {
    const values = submittedValues(
      form({
        email: "a@b.cz",
        nickname: "Karl",
        country: "CZ",
        skill: "intermediate",
        phone: "+420777123456",
      }),
    );
    expect(values).toMatchObject({
      email: "a@b.cz",
      nickname: "Karl",
      country: "CZ",
      skill: "intermediate",
      phone: "+420777123456",
    });
  });

  it("NEVER carries the password back", () => {
    // Echoing it would put a plaintext password in the RSC payload and in a
    // DOM attribute. Re-typing one field is cheaper than that, and it is the
    // one a password manager refills for free.
    const values = submittedValues(form({ email: "a@b.cz", password: "hunter2hunter2" }));
    expect(Object.values(values)).not.toContain("hunter2hunter2");
    expect(JSON.stringify(values)).not.toContain("hunter2");
  });

  it("keeps the box the player DID tick", () => {
    // The whole point of the bug: ticking one consent and missing the other
    // must not reset both, or the error blames the box that was fine.
    const values = submittedValues(form({ tos: "on" }));
    expect(values.tos).toBe(true);
    expect(values.gdpr).toBe(false);
  });

  it("reads an unticked box as false rather than as missing", () => {
    // A checkbox is absent from the payload when unticked — `undefined` here
    // would render as an uncontrolled input and React would warn.
    const values = submittedValues(form({}));
    expect(values.tos).toBe(false);
    expect(values.gdpr).toBe(false);
    expect(values.marketing).toBe(false);
    expect(values.email).toBe("");
  });
});
